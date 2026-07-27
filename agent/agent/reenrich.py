"""Re-enrich worker — find recruiter emails for leads that never got one.

The scrape pipeline enriches each lead once, at discovery time. Anything it
couldn't resolve (no provider key configured, daily cap already spent, a company
Hunter didn't know yet) parks as `manual_apply` with a drafted email but no
recipient. This worker works down that backlog:

    backlog (best match score, never-tried first)
      -> enrich (Hunter, searched by company name)
      -> found: re-address the draft, status manual_apply -> dry_run
      -> miss:  stamp enriched_at so the next run tries a different company

Budget: the same daily Hunter cap as the pipeline (`usage` table), so a scrape
and a re-enrich run on the same day share one allowance rather than doubling
spend. Results are cached per company for the run, so ten jobs at one company
cost one search.

Re-drafting: when the stored `job_description` is present the email is rewritten
from scratch (same strict JD grounding as the first draft) so it can address the
recruiter by name. Rows scraped before descriptions were persisted have no JD to
ground against, so their existing draft is kept and only the greeting line is
re-addressed — a stale-but-grounded email beats a fresh ungrounded one.

Run: python -m agent.reenrich
"""
from __future__ import annotations

import logging
import os
import re
from collections import Counter
from datetime import datetime, timezone

from .config import Config, get_config
from . import store
from .enrich import enrich, cache_key, is_lookupable
from .email_writer import write_email

log = logging.getLogger(__name__)

_ENRICH_FIELDS = ("job_id", "recruiter_name", "recruiter_email", "recruiter_title",
                  "email_confidence", "email_source", "company_domain")

# Leading "Hi X," / "Hello X," / "Hey X," of an existing draft.
_GREETING = re.compile(r"\A\s*(Hi|Hello|Hey|Dear)\b[^,\n]*,", re.IGNORECASE)

# How many backlog rows to pull per search of budget. Multiple jobs often share
# one company (cache hits cost nothing), so we fetch more rows than searches.
_ROWS_PER_SEARCH = 3


def readdress(body: str, recruiter_name: str) -> str:
    """Swap the greeting of an existing draft to the real contact's name."""
    name = (recruiter_name or "").strip() or "Hiring Team"
    first = name.split()[0] if name and name != "Hiring Team" else name
    if _GREETING.match(body or ""):
        return _GREETING.sub("Hi " + first + ",", body or "", count=1)
    return "Hi " + first + ",\n\n" + (body or "")


def run(cfg: Config | None = None, limit: int | None = None, job_id: str | None = None) -> dict:
    cfg = cfg or get_config()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    now = datetime.now(tz=timezone.utc)

    if not cfg.hunter_api_key:
        log.info("no HUNTER_API_KEY -> nothing to do")
        return {"enriched": 0, "skipped": "no_provider"}

    profile = store.get_settings(cfg)
    today_iso = now.date().isoformat()
    budget = store.hunter_remaining(cfg, today_iso, today_iso[:7])
    if budget == 0:
        log.info("Hunter allowance spent (daily cap %d, monthly cap %d) -> holding",
                 cfg.hunter_daily_cap, cfg.hunter_monthly_cap)
        return {"enriched": 0, "skipped": "daily_cap"}

    state = {"remaining": budget, "used": 0, "disabled": not bool(cfg.hunter_api_key), "cache": {}}

    # A single job_id targets one lead (the dashboard's per-lead "Find email"),
    # otherwise work the backlog best-match-first.
    rows = (store.get_lead_for_enrich(cfg, job_id) if job_id
            else store.get_enrich_backlog(cfg, limit=limit or max(30, budget * _ROWS_PER_SEARCH)))
    log.info("re-enrich: %d %s, Hunter budget %d (daily %d / monthly %d)",
             len(rows), "targeted lead" if job_id else "backlog rows", budget,
             cfg.hunter_daily_cap, cfg.hunter_monthly_cap)

    outcomes: Counter[str] = Counter()
    for row in rows:
        # Out of budget and this company was never looked up this run -> stop.
        # (A cached company still resolves for free, so those keep flowing.)
        out_of_budget = state["remaining"] <= 0 or state["disabled"]
        if out_of_budget and cache_key(row) not in state["cache"]:
            log.info("budget exhausted -> stopping (%d rows left unprocessed)",
                     len(rows) - sum(outcomes.values()))
            break

        if not is_lookupable(row):
            store.upsert(cfg, {"job_id": row["job_id"], "enriched_at": now.isoformat(),
                               "notes": "Skipped enrichment: job reposter/aggregator, not a real employer. Apply via the job link."})
            outcomes["not_lookupable"] += 1
            continue

        ctx = enrich(dict(row), cfg, state)
        store.upsert(cfg, {**{k: ctx.get(k) for k in _ENRICH_FIELDS},
                           "enriched_at": datetime.now(tz=timezone.utc).isoformat()})

        if not ctx.get("email_found"):
            outcomes["no_email"] += 1
            log.info("  [no_email    ] %.40s @ %s", row.get("job_title"), row.get("company"))
            continue

        # Re-draft against the stored JD when we have one; otherwise keep the
        # grounded draft already on the row and just fix the greeting.
        if str(row.get("job_description") or "").strip():
            drafted = write_email({**ctx, "description": row["job_description"]}, cfg, profile)
            subject, body = drafted.get("email_subject"), drafted.get("email_body")
            note = "Recruiter found - draft rewritten for them. Review + Apply to queue. "
        else:
            subject = row.get("email_subject")
            body = readdress(str(row.get("email_body") or ""), str(ctx.get("recruiter_name") or ""))
            note = "Recruiter found - existing draft re-addressed to them. Review + Apply to queue. "

        store.upsert(cfg, {
            "job_id": row["job_id"], "status": "dry_run",
            "email_subject": subject, "email_body": body, "notes": note.strip(),
        })
        outcomes["enriched"] += 1
        log.info("  [enriched    ] %.40s @ %s  ->  %s (%s, %s)", row.get("job_title"), row.get("company"),
                 ctx.get("recruiter_email"), ctx.get("recruiter_title") or "?", ctx.get("email_source"))

    if state["used"] > 0:
        store.incr_hunter_calls(cfg, today_iso, state["used"])

    summary = {**dict(outcomes), "hunter_searches": state["used"],
               "cache_hits": state.get("cache_hits", 0)}
    log.info("re-enrich complete: %s", summary)
    return summary


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Find recruiter emails for leads that never got one.")
    ap.add_argument("--limit", type=int, default=None,
                    help="max backlog rows to pull (default: scales with the search budget)")
    ap.add_argument("--job-id", default=os.environ.get("REENRICH_JOB_ID", "").strip() or None,
                    help="enrich this one lead instead of the backlog")
    args = ap.parse_args()
    run(limit=args.limit, job_id=args.job_id)
