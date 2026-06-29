"""Follow-up engine — daily reply-detection / follow-up / close.

Port of the n8n follow-up flow (Select Due -> Route -> follow-up/close), reading
Supabase instead of a Sheet and using the candidate's editable followup_template.

Lifecycle per lead:
  applied,      no reply, >= 5 business days  -> send one follow-up -> followed_up
  followed_up,  no reply, >= 3 days            -> closed   (never a third email)
  any,          recruiter replied              -> replied  (stops)

Reply detection needs the connected Gmail inbox (a list of {sender, ts}). Until
Gmail is wired (see agent/google.py, step 4), `inbox` is empty -> follow-ups are
time-based only and no replies are auto-detected. Sending is also deferred to the
Gmail layer; until then this runs dry (marks status, stores the draft in notes).
"""
from __future__ import annotations

import logging
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

from dateutil import parser as dateparser

from .config import Config, get_config
from . import store
from . import google
from .llm import chat, extract_json
from .email_writer import _signature, fill_template, strip_dashes

log = logging.getLogger(__name__)

FOLLOWUP_AFTER_BUSINESS_DAYS = 5
CLOSE_AFTER_DAYS = 3

_DEFAULT_FU_TEMPLATE = (
    "Hi {recruiter_name},\n\n"
    "Circling back on my application for {role} at {company} — still very interested "
    "and happy to chat if the role is still open.\n\n"
    "{signature}"
)


def _parse(iso: Any) -> datetime | None:
    if not iso:
        return None
    try:
        dt = dateparser.parse(str(iso))
    except (ValueError, OverflowError, TypeError):
        return None
    if dt and dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _truthy(v: Any) -> bool:
    return v is True or str(v).lower() == "true"


def business_days_since(iso: Any, now: datetime) -> int:
    start = _parse(iso)
    if not start:
        return 0
    days, d = 0, start
    while True:
        d = d + timedelta(days=1)
        if d > now:
            break
        if d.weekday() < 5:  # Mon-Fri
            days += 1
    return days


def days_since(iso: Any, now: datetime) -> float:
    start = _parse(iso)
    return 0.0 if not start else (now - start).total_seconds() / 86400


def select_due(rows: list[dict], inbox: list[dict], now: datetime) -> list[tuple[dict, str]]:
    """Decide per row: 'replied' | 'followup' | 'close' | (skip)."""
    out: list[tuple[dict, str]] = []

    def replied_after(email: str, since_iso: Any) -> bool:
        since = _parse(since_iso)
        if not since:
            return False
        return any(m.get("sender", "").lower() == email and m.get("ts") and m["ts"] > since for m in inbox)

    for r in rows:
        email = str(r.get("recruiter_email") or "").lower()
        if not email:
            continue
        status = str(r.get("status") or "").lower()

        if status == "applied" and not _truthy(r.get("followup_sent")):
            if replied_after(email, r.get("applied_at")):
                out.append((r, "replied"))
            elif business_days_since(r.get("applied_at"), now) >= FOLLOWUP_AFTER_BUSINESS_DAYS:
                out.append((r, "followup"))
        elif status == "followed_up":
            if replied_after(email, r.get("followup_date") or r.get("applied_at")):
                out.append((r, "replied"))
            elif days_since(r.get("followup_date"), now) >= CLOSE_AFTER_DAYS:
                out.append((r, "close"))
    return out


def build_followup_prompt(job: dict[str, Any], profile: dict[str, Any]) -> str:
    signature = _signature(profile, get_config())
    template = profile.get("followup_template") or _DEFAULT_FU_TEMPLATE
    filled = fill_template(template, job, signature)
    return "\n".join([
        f"Write a short follow-up email for {job.get('job_title', '')} at {job.get('company', '')}, "
        f"following up on an application already sent.",
        "",
        "Produce the FINAL email following this template for structure, tone and length. "
        "Replace any [bracketed instruction] with tailored content; keep the rest as written.",
        "",
        "TEMPLATE:",
        filled,
        "",
        "Rules: keep it 2-3 lines, light, natural and confident (just circling back), do not re-pitch or "
        "re-attach. Do NOT use em dashes (the '—' character). You may offer a quick 20-minute call.",
        "",
        'Return ONLY this JSON: { "body": "the follow-up body" }',
        "Return JSON only. No markdown. No backticks.",
    ])


def write_followup(job: dict[str, Any], cfg: Config, profile: dict[str, Any]) -> dict[str, Any]:
    ctx = dict(job)
    response = chat(build_followup_prompt(job, profile), cfg)
    _, parsed = extract_json(response)

    orig_subject = str(job.get("email_subject") or f"{job.get('job_title', 'Role')} application")
    ctx["fu_subject"] = ("Re: " + orig_subject)[:150]
    if parsed and parsed.get("body"):
        ctx["fu_body"] = strip_dashes(str(parsed["body"]))
        ctx["fu_note"] = ""
    else:
        ctx["fu_body"] = strip_dashes(fill_template(profile.get("followup_template") or _DEFAULT_FU_TEMPLATE, job, _signature(profile, cfg)))
        ctx["fu_note"] = "LLM follow-up failed - used template as-is. "
    return ctx


def _send_followup(cfg: Config, row: dict, drafted: dict, iso: str, throttle: bool, outcomes: Counter) -> None:
    """LIVE send of one follow-up (no resume re-attach). Failure -> send_error."""
    try:
        google.send_email(cfg, to=str(row.get("recruiter_email") or ""),
                          subject=drafted["fu_subject"], body=drafted["fu_body"])
    except Exception as exc:  # noqa: BLE001
        store.upsert(cfg, {"job_id": row["job_id"], "status": "send_error",
                           "notes": ("Follow-up send failed: " + str(exc))[:300]})
        outcomes["send_error"] += 1
        log.warning("  follow-up send_error %s: %s", row.get("company"), exc)
        return
    store.upsert(cfg, {
        "job_id": row["job_id"], "status": "followed_up",
        "followup_sent": True, "followup_date": iso,
        "notes": ("Follow-up sent: " + drafted["fu_subject"])[:300],
    })
    outcomes["followup"] += 1
    if throttle and cfg.send_throttle_seconds > 0:
        time.sleep(cfg.send_throttle_seconds)


def run(cfg: Config | None = None, now: datetime | None = None, inbox: list[dict] | None = None) -> dict[str, int]:
    cfg = cfg or get_config()
    now = now or datetime.now(tz=timezone.utc)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    # Pull the real inbox for reply detection unless one was injected (tests).
    if inbox is None:
        inbox = google.fetch_inbox(cfg) if google.is_ready(cfg) else []

    profile = store.get_settings(cfg)
    sending = bool(profile.get("send_emails")) and google.is_ready(cfg)
    rows = store.get_all_rows(cfg)
    due = select_due(rows, inbox, now)
    log.info("follow-up scan: %d rows, %d due (inbox msgs: %d, send=%s)",
             len(rows), len(due), len(inbox), sending)

    outcomes: Counter[str] = Counter()
    iso = now.isoformat()

    for row, action in due:
        if action == "replied":
            store.upsert(cfg, {"job_id": row["job_id"], "status": "replied", "reply_received": True, "reply_date": iso})
            outcomes["replied"] += 1
        elif action == "close":
            store.upsert(cfg, {"job_id": row["job_id"], "status": "closed"})
            outcomes["close"] += 1
        elif action == "followup":
            drafted = write_followup(row, cfg, profile)
            if sending:
                _send_followup(cfg, row, drafted, iso, throttle=True, outcomes=outcomes)
            else:
                store.upsert(cfg, {
                    "job_id": row["job_id"], "status": "followed_up",
                    "followup_sent": True, "followup_date": iso,
                    "notes": ("TEST MODE: follow-up NOT sent (dry-run). " + (drafted.get("fu_note") or "")
                              + "subject: " + drafted["fu_subject"]).strip(),
                })
                outcomes["followup"] += 1

    log.info("follow-up complete -> %s", dict(outcomes) or "nothing due")
    return dict(outcomes)


if __name__ == "__main__":
    run()
