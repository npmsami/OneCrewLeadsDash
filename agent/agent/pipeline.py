"""Main pipeline — the Python equivalent of the n8n 12-hourly flow.

    discover -> filter (vs stored rows) -> store(new)
      -> score -> store -> route by status
           scored      -> enrich -> store
                            email found -> draft cold email -> store(dry_run*)
                            no email     -> store(manual_apply)
           geo_blocked / low_match / score_error -> store(side-exit status)

* Sending (Gmail) + resume attachment is the go-live layer, not yet wired, so
  even when settings.send_emails is true this pass stays in dry-run and records
  status=dry_run. The dashboard reads every row produced here.
"""
from __future__ import annotations

import logging
import time
from collections import Counter
from datetime import datetime, timezone

from .config import Config, get_config
from . import store
from . import google
from .sources import fetch_all
from .filters import hard_filters, filter_new
from .score import score_job
from .enrich import enrich
from .email_writer import write_email

log = logging.getLogger(__name__)

_LOG_NEW_FIELDS = ("job_id", "job_title", "company", "source", "job_url", "posted_date", "scraped_at")
_SCORE_FIELDS = ("job_id", "match_score", "matched_track", "matched_keywords", "missing_keywords",
                 "seniority_match", "geo_eligible", "geo_reason", "status", "notes")
_ENRICH_FIELDS = ("job_id", "recruiter_name", "recruiter_email", "email_confidence", "email_source", "status")


def _pick(row: dict, fields) -> dict:
    return {k: row.get(k) for k in fields}


def _send_cold_email(cfg: Config, drafted: dict, send_ctx: dict, outcomes: Counter) -> None:
    """LIVE send of one drafted cold email + resume, then mark applied. On
    failure the lead is parked as send_error (recoverable) rather than lost."""
    to = str(drafted.get("recruiter_email") or "")
    try:
        mid = google.send_email(
            cfg, to=to, subject=drafted["email_subject"], body=drafted["email_body"],
            attachment=send_ctx["resume"], filename=send_ctx["resume_name"] or "Resume.pdf",
        )
    except Exception as exc:  # noqa: BLE001
        store.upsert(cfg, {"job_id": drafted["job_id"], "status": "send_error",
                           "notes": ("Send failed: " + str(exc))[:300]})
        outcomes["send_error"] += 1
        log.warning("  [send_error  ] %.40s @ %s  ->  %s", drafted.get("job_title"), drafted.get("company"), exc)
        return

    store.upsert(cfg, {
        "job_id": drafted["job_id"], "status": "applied",
        "applied_at": datetime.now(tz=timezone.utc).isoformat(),
        "email_subject": drafted.get("email_subject"),
        "email_body": drafted.get("email_body"),
        "notes": ("Sent to " + to + ": " + str(drafted.get("email_subject") or ""))[:300],
    })
    outcomes["applied"] += 1
    log.info("  [applied     ] %.40s @ %s  ->  %s (msg %s)", drafted.get("job_title"), drafted.get("company"), to, mid)
    if cfg.send_throttle_seconds > 0:
        time.sleep(cfg.send_throttle_seconds)


def _enrich_and_route(scored: dict, cfg: Config, profile: dict, send_ctx: dict, outcomes: Counter) -> None:
    """Enrich one scored job, then route it: manual_apply (no email) ->
    applied (live send) / dry_run."""
    enriched = enrich(scored, cfg)
    store.upsert(cfg, _pick(enriched, _ENRICH_FIELDS))

    # Draft the application email for EVERY lead — even when no recruiter email
    # was found — so manual_apply rows carry a ready-to-copy draft in the dashboard.
    drafted = write_email(enriched, cfg, profile)

    if not enriched.get("email_found"):
        store.upsert(cfg, {
            "job_id": enriched["job_id"], "status": "manual_apply",
            "email_subject": drafted.get("email_subject"),
            "email_body": drafted.get("email_body"),
            "notes": "No recruiter email found - apply manually via job_url (draft ready to copy).",
        })
        outcomes["manual_apply"] += 1
        log.info("  [manual_apply] %.40s @ %s", enriched.get("job_title"), enriched.get("company"))
        return

    if send_ctx["sending"]:
        _send_cold_email(cfg, drafted, send_ctx, outcomes)
        return

    # Dry-run: draft only, never sent.
    store.upsert(cfg, {
        "job_id": drafted["job_id"],
        "status": "dry_run",
        "email_subject": drafted.get("email_subject"),
        "email_body": drafted.get("email_body"),
        "notes": ("TEST MODE: email NOT sent (dry-run). " + (drafted.get("email_note") or "")).strip(),
    })
    outcomes["dry_run"] += 1
    log.info("  [dry_run     ] %.40s @ %s  ->  %s (%s)", drafted.get("job_title"), drafted.get("company"),
             drafted.get("recruiter_email"), drafted.get("email_subject"))


def run(cfg: Config | None = None) -> dict[str, int]:
    cfg = cfg or get_config()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    profile = store.get_settings(cfg)

    # Live send only when the dashboard toggle is on AND Gmail is fully wired.
    sending = bool(profile.get("send_emails")) and google.is_ready(cfg)
    resume = resume_name = None
    if sending:
        resume, resume_name = store.download_resume(cfg)
        log.info("LIVE send mode ON (send_emails=true, Gmail ready)%s",
                 "" if resume else " - WARNING: no resume in bucket, emails go out unattached")
    elif profile.get("send_emails"):
        log.info("send_emails=true but Gmail not ready (creds/refresh token) -> staying in dry-run")
    else:
        log.info("dry-run (send_emails=false): score/enrich/draft, never send")
    send_ctx = {"sending": sending, "resume": resume, "resume_name": resume_name}

    existing = store.get_existing_rows(cfg)
    raw = fetch_all(cfg)
    filtered = hard_filters(raw, cfg)
    fresh = filter_new(filtered, existing, cfg)
    log.info("discovery: %d raw -> %d filtered -> %d fresh (cap %d, %d already stored)",
             len(raw), len(filtered), len(fresh), cfg.max_jobs_per_run, len(existing))

    outcomes: Counter[str] = Counter()

    # --- Fresh jobs: log -> score -> (enrich within budget) ---
    for job in fresh:
        store.upsert(cfg, {**_pick(job, _LOG_NEW_FIELDS), "status": "new"})

        scored = score_job(job, cfg)
        store.upsert(cfg, _pick(scored, _SCORE_FIELDS))

        if scored["status"] != "scored":
            outcomes[scored["status"]] += 1
            log.info("  [%-12s] %.40s @ %s", scored["status"], scored["job_title"], scored["company"])
            continue

        _enrich_and_route(scored, cfg, profile, send_ctx, outcomes)

    summary = dict(outcomes)
    log.info("run complete %s -> %s", datetime.now(tz=timezone.utc).isoformat(timespec="seconds"), summary or "no fresh jobs")
    return summary


if __name__ == "__main__":
    run()
