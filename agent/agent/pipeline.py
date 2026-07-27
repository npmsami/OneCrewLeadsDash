"""Main pipeline — discover, score, enrich, and DRAFT (never auto-send).

    discover -> filter (vs stored rows) -> store(new)
      -> score -> store -> route by status
           scored      -> enrich (Hunter) -> draft email -> store
                            email found -> status=dry_run  (draft ready)
                            no email     -> status=manual_apply (draft ready)
           geo_blocked / low_match / score_error -> store(side-exit status)

This pass NEVER sends email. Sending is human-gated: the dashboard "Apply"
button enqueues a reviewed/edited email into `outreach_queue`, and the separate
`agent.outreach` worker sends queued items one at a time. So every lead here
ends as a ready-to-review draft with app_status left at its default 'remaining'
(the pipeline never touches app_status, so a user's manual decision is safe
across re-scrapes).

At the end of a run a summary row is written to `scrape_runs` for the dashboard
Overview: total scraped, qualified, unqualified, duplicates skipped, per-source.
"""
from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime, timezone

from .config import Config, get_config
from . import store
from .sources import fetch_all
from .filters import hard_filters, filter_new
from .score import score_job
from .enrich import enrich
from .email_writer import write_email

log = logging.getLogger(__name__)

_LOG_NEW_FIELDS = ("job_id", "job_title", "company", "source", "publisher",
                   "job_url", "posted_date", "scraped_at")
_SCORE_FIELDS = ("job_id", "match_score", "matched_track", "matched_keywords", "missing_keywords",
                 "seniority_match", "geo_eligible", "geo_reason", "status", "qualified", "notes")
_ENRICH_FIELDS = ("job_id", "recruiter_name", "recruiter_email", "recruiter_title",
                  "email_confidence", "email_source", "company_domain", "status")

# The JD is stored (truncated) so an email can be re-drafted later with the same
# grounding the first draft had — the writer reads 4k, the scorer 7k.
_DESCRIPTION_LIMIT = 20_000


def _pick(row: dict, fields) -> dict:
    return {k: row.get(k) for k in fields}


def _enrich_and_route(scored: dict, cfg: Config, profile: dict, hunter_state: dict, outcomes: Counter) -> None:
    """Enrich one scored job and store a draft. Never sends — the lead waits in
    the dashboard for the user to review + Apply."""
    enriched = enrich(scored, cfg, hunter_state)
    store.upsert(cfg, {**_pick(enriched, _ENRICH_FIELDS),
                       "enriched_at": datetime.now(tz=timezone.utc).isoformat()})

    # Draft the application email for EVERY qualified lead (even without a
    # recruiter email) so the review screen always has something to edit.
    drafted = write_email(enriched, cfg, profile)

    if not enriched.get("email_found"):
        store.upsert(cfg, {
            "job_id": enriched["job_id"], "status": "manual_apply",
            "email_subject": drafted.get("email_subject"),
            "email_body": drafted.get("email_body"),
            "notes": "No recruiter email found - review the draft, add a recipient, then Apply (or apply manually via the job link).",
        })
        outcomes["manual_apply"] += 1
        log.info("  [manual_apply] %.40s @ %s", enriched.get("job_title"), enriched.get("company"))
        return

    store.upsert(cfg, {
        "job_id": drafted["job_id"], "status": "dry_run",
        "email_subject": drafted.get("email_subject"),
        "email_body": drafted.get("email_body"),
        "notes": ("Draft ready - review + Apply to queue the email. " + (drafted.get("email_note") or "")).strip(),
    })
    outcomes["dry_run"] += 1
    log.info("  [dry_run     ] %.40s @ %s  ->  %s (%s)", drafted.get("job_title"), drafted.get("company"),
             drafted.get("recruiter_email"), drafted.get("email_subject"))


def run(cfg: Config | None = None) -> dict[str, int]:
    cfg = cfg or get_config()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    started_at = datetime.now(tz=timezone.utc)

    profile = store.get_settings(cfg)

    # Hunter per-run budget: the tighter of the daily and monthly caps, shared
    # with the re-enrich worker via the `usage` table. `cache` dedupes lookups
    # so several jobs at one company cost a single search.
    today_iso = started_at.date().isoformat()
    month_prefix = today_iso[:7]
    hunter_state = {
        "remaining": store.hunter_remaining(cfg, today_iso, month_prefix),
        "used": 0,
        "disabled": not bool(cfg.hunter_api_key),
        "cache": {},
    }
    if cfg.hunter_api_key:
        log.info("Hunter enabled: %d searches available (daily cap %d, monthly cap %d)",
                 hunter_state["remaining"], cfg.hunter_daily_cap, cfg.hunter_monthly_cap)
    else:
        log.info("Hunter disabled (no HUNTER_API_KEY)")

    existing = store.get_existing_rows(cfg)
    raw = fetch_all(cfg)
    filtered = hard_filters(raw, cfg)
    fresh = filter_new(filtered, existing, cfg)

    # Duplicates skipped = discovered rows that were already stored (pre-cap).
    existing_ids = {str(r["job_id"]) for r in existing if r.get("job_id")}
    existing_pairs = {(str(r["job_title"]) + "|" + str(r["company"])).lower()
                      for r in existing if r.get("job_title") and r.get("company")}
    duplicates = sum(
        1 for j in filtered
        if str(j["job_id"]) in existing_ids
        or (str(j["job_title"]) + "|" + str(j["company"])).lower() in existing_pairs
    )
    log.info("discovery: %d raw -> %d filtered -> %d fresh (cap %d, %d dupes vs %d stored)",
             len(raw), len(filtered), len(fresh), cfg.max_jobs_per_run, duplicates, len(existing))

    outcomes: Counter[str] = Counter()
    qualified = unqualified = 0
    source_breakdown: Counter[str] = Counter()

    for job in fresh:
        source_breakdown[str(job.get("source") or "unknown")] += 1
        store.upsert(cfg, {
            **_pick(job, _LOG_NEW_FIELDS),
            "job_description": str(job.get("description") or "")[:_DESCRIPTION_LIMIT],
            "status": "new",
        })

        scored = score_job(job, cfg)
        store.upsert(cfg, _pick(scored, _SCORE_FIELDS))

        if scored["status"] != "scored":
            outcomes[scored["status"]] += 1
            unqualified += 1
            log.info("  [%-12s] %.40s @ %s", scored["status"], scored["job_title"], scored["company"])
            continue

        qualified += 1
        _enrich_and_route(scored, cfg, profile, hunter_state, outcomes)

    # Persist Hunter usage for the daily cap.
    if hunter_state["used"] > 0:
        store.incr_hunter_calls(cfg, today_iso, hunter_state["used"])

    finished_at = datetime.now(tz=timezone.utc)
    summary = dict(outcomes)
    try:
        store.insert_scrape_run(cfg, {
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "total_scraped": len(fresh),
            "qualified": qualified,
            "unqualified": unqualified,
            "duplicates_skipped": duplicates,
            "source_breakdown": dict(source_breakdown),
            "status": "complete",
        })
    except Exception as exc:  # noqa: BLE001 — stats are best-effort, never fail the run
        log.warning("scrape_runs summary write failed: %s", exc)

    log.info("run complete %s -> %s (qualified=%d, unqualified=%d, dupes=%d)",
             finished_at.isoformat(timespec="seconds"), summary or "no fresh jobs",
             qualified, unqualified, duplicates)
    return summary


if __name__ == "__main__":
    run()
