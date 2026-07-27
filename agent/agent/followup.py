"""Follow-up engine — reply detection + follow-up DRAFTING. Never sends.

This engine used to send a follow-up on its own after 5 business days. It no
longer sends anything: follow-ups are human-gated exactly like first contact.
This pass only observes and prepares, and the user decides in the dashboard's
Sent Emails screen (edit the draft -> queue it -> agent.outreach sends it).

Lifecycle per lead:
  applied,      recruiter replied             -> replied (stops; no follow-up)
  applied,      no reply, >= 24h since sending -> DRAFT a follow-up onto the row
                                                  (followup_subject/body), which
                                                  unlocks the dashboard button
  followed_up,  recruiter replied             -> replied
  followed_up,  no reply, >= 3 days            -> closed  (never a third email)

Reply detection reads the connected Gmail inbox (a list of {sender, ts}).
Without Gmail the inbox is empty, so nothing is marked replied and drafting is
purely time-based.
"""
from __future__ import annotations

import logging
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

# The dashboard unlocks "Send follow-up" once an email has gone unanswered for
# this long. Hours, not business days: the user asked for a 24h gate.
FOLLOWUP_AFTER_HOURS = 24
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


def days_since(iso: Any, now: datetime) -> float:
    start = _parse(iso)
    return 0.0 if not start else (now - start).total_seconds() / 86400


def select_due(rows: list[dict], inbox: list[dict], now: datetime,
               sent_at_by_job: dict[str, str] | None = None) -> list[tuple[dict, str]]:
    """Decide per row: 'replied' | 'draft_followup' | 'close' | (skip).

    'draft_followup' prepares an editable draft; it never means "send".

    `sent_at_by_job` maps job_id -> when the first email actually went out
    (outreach_queue). A lead only becomes follow-up-eligible if it appears
    there: `applied_at` alone is not proof an email was sent, since the manual
    "Mark applied" button stamps it too.
    """
    out: list[tuple[dict, str]] = []
    sent_at_by_job = sent_at_by_job or {}

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

        sent_at = sent_at_by_job.get(str(r.get("job_id") or ""))
        if sent_at and not _truthy(r.get("followup_sent")):
            if replied_after(email, sent_at):
                out.append((r, "replied"))
            elif (days_since(sent_at, now) * 24 >= FOLLOWUP_AFTER_HOURS
                  and not str(r.get("followup_body") or "").strip()):
                # Draft once; a draft already on the row is the user's to edit.
                out.append((r, "draft_followup"))
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


def _store_followup_draft(cfg: Config, row: dict, drafted: dict, iso: str) -> None:
    """Park an editable follow-up draft on the lead. Sending is the user's call:
    the Sent Emails screen unlocks once this exists, and queues it from there.

    Deliberately does NOT touch `status`, `followup_sent` or `followup_date` —
    those still mean "a follow-up actually went out", and the outreach worker
    sets them when it sends the queued follow-up.
    """
    store.upsert(cfg, {
        "job_id": row["job_id"],
        "followup_subject": drafted["fu_subject"],
        "followup_body": drafted["fu_body"],
        "followup_generated_at": iso,
        "notes": ("Follow-up draft ready - review + send from Sent Emails. "
                  + (drafted.get("fu_note") or "")).strip()[:300],
    })


def run(cfg: Config | None = None, now: datetime | None = None, inbox: list[dict] | None = None) -> dict[str, int]:
    cfg = cfg or get_config()
    now = now or datetime.now(tz=timezone.utc)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    # Pull the real inbox for reply detection unless one was injected (tests).
    if inbox is None:
        inbox = google.fetch_inbox(cfg) if google.is_ready(cfg) else []

    profile = store.get_settings(cfg)
    rows = store.get_all_rows(cfg)
    sent_at_by_job = store.get_sent_initial_map(cfg)
    due = select_due(rows, inbox, now, sent_at_by_job)
    log.info("follow-up scan: %d rows, %d due (inbox msgs: %d) - drafting only, never sends",
             len(rows), len(due), len(inbox))

    outcomes: Counter[str] = Counter()
    iso = now.isoformat()

    for row, action in due:
        if action == "replied":
            store.upsert(cfg, {"job_id": row["job_id"], "status": "replied", "reply_received": True, "reply_date": iso})
            outcomes["replied"] += 1
        elif action == "close":
            store.upsert(cfg, {"job_id": row["job_id"], "status": "closed"})
            outcomes["close"] += 1
        elif action == "draft_followup":
            _store_followup_draft(cfg, row, write_followup(row, cfg, profile), iso)
            outcomes["drafted"] += 1

    log.info("follow-up complete -> %s", dict(outcomes) or "nothing due")
    return dict(outcomes)


if __name__ == "__main__":
    run()
