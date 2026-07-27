"""Storage layer — Supabase, replacing every Google Sheets node.

The n8n workflow used Sheets `appendOrUpdate` keyed on `job_id`; here that's a
Postgres upsert on the `job_id` primary key. Each pipeline stage upserts the
subset of columns it owns (log-new, save-score, save-enrichment, save-resume,
mark-applied/dry/manual, follow-up marks) — partial upserts only touch the
columns supplied, leaving the rest intact.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from supabase import Client, create_client

from .config import Config

log = logging.getLogger(__name__)

TABLE = "applications"

# Columns the table actually has (from supabase/schema.sql). Anything else in a
# context dict (description, llm_body, resume_text, ...) is dropped before write.
VALID_COLUMNS = {
    "job_id", "job_title", "company", "matched_track", "source", "job_url",
    "posted_date", "scraped_at", "match_score", "geo_eligible", "geo_reason",
    "seniority_match", "matched_keywords", "missing_keywords", "recruiter_name",
    "recruiter_email", "email_confidence", "email_source", "resume_filename",
    "resume_drive_link", "email_subject", "email_body", "applied_at", "reply_received",
    "reply_date", "followup_sent", "followup_date", "status", "notes",
    # human apply-flow (migration 0002): user-facing status, qualification, publisher
    "app_status", "qualified", "publisher",
    # enrichment (migration 0003): what the provider resolved + when we last tried
    "company_domain", "recruiter_title", "enriched_at",
    # migration 0005: editable follow-up draft awaiting the user's decision
    "followup_subject", "followup_body", "followup_generated_at",
    # migration 0004: JD text kept so emails can be re-drafted with grounding
    "job_description",
}

# Typed columns where an empty string is invalid and must become SQL NULL.
_NULLABLE_TYPED = {
    "posted_date", "scraped_at", "applied_at", "reply_date", "followup_date", "enriched_at",
    "followup_generated_at",  # timestamptz
    "match_score",  # smallint
    "geo_eligible",  # boolean
}
# NOT NULL booleans (default false) — never send NULL; drop the key instead.
_NOT_NULL_BOOL = {"reply_received", "followup_sent"}


@lru_cache(maxsize=1)
def _client_cached(url: str, key: str) -> Client:
    return create_client(url, key)


def get_client(cfg: Config) -> Client:
    if not cfg.supabase_url or not cfg.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from env")
    return _client_cached(cfg.supabase_url, cfg.supabase_service_role_key)


def _clean(row: dict[str, Any]) -> dict[str, Any]:
    """Keep only real columns; coerce ''→NULL for typed cols; drop bad NOT NULL bools."""
    out: dict[str, Any] = {}
    for k, v in row.items():
        if k not in VALID_COLUMNS:
            continue
        if v == "" and k in _NULLABLE_TYPED:
            v = None
        if k in _NOT_NULL_BOOL and v in (None, ""):
            continue
        out[k] = v
    return out


def upsert(cfg: Config, row: dict[str, Any]) -> None:
    """Insert-or-update one job row, keyed on job_id."""
    payload = _clean(row)
    if "job_id" not in payload:
        raise ValueError("upsert requires job_id")
    get_client(cfg).table(TABLE).upsert(payload, on_conflict="job_id").execute()


def get_existing_rows(cfg: Config) -> list[dict[str, Any]]:
    """For filter_new: every stored job's id + title + company."""
    resp = get_client(cfg).table(TABLE).select("job_id,job_title,company").execute()
    return resp.data or []


def get_all_rows(cfg: Config) -> list[dict[str, Any]]:
    """Full table read for the follow-up engine (Read All Rows)."""
    resp = get_client(cfg).table(TABLE).select("*").execute()
    return resp.data or []


def delete_job(cfg: Config, job_id: str) -> None:
    """Test/maintenance helper — remove one row by id."""
    get_client(cfg).table(TABLE).delete().eq("job_id", job_id).execute()


# Fields the re-enrich pass needs to look a company up and re-draft its email.
_BACKLOG_FIELDS = (
    "job_id,job_title,company,company_domain,job_url,source,match_score,matched_track,"
    "matched_keywords,missing_keywords,seniority_match,geo_reason,status,enriched_at,"
    "job_description,email_subject,email_body"
)


def get_lead_for_enrich(cfg: Config, job_id: str) -> list[dict[str, Any]]:
    """One specific lead, for the dashboard's per-lead 'Find email' action."""
    resp = (get_client(cfg).table(TABLE).select(_BACKLOG_FIELDS)
            .eq("job_id", job_id).limit(1).execute())
    return resp.data or []


def get_enrich_backlog(cfg: Config, limit: int = 50) -> list[dict[str, Any]]:
    """Qualified leads that still have no recruiter email, best match first.

    Never-attempted rows sort ahead of already-attempted ones, so a repeated run
    works down fresh companies instead of re-paying for the same dead ends. Rows
    the user has already acted on (queued/applied/done) are excluded — enriching
    them would only churn an email that has shipped.
    """
    resp = (get_client(cfg).table(TABLE)
            .select(_BACKLOG_FIELDS)
            .is_("recruiter_email", "null")
            .eq("status", "manual_apply")
            .eq("app_status", "remaining")
            .order("enriched_at", desc=False, nullsfirst=True)
            .order("match_score", desc=True, nullsfirst=False)
            .limit(limit)
            .execute())
    return resp.data or []


# ---------------------------------------------------------------------------
# Candidate Signature settings (singleton row, edited from the dashboard)
# ---------------------------------------------------------------------------
SETTINGS_TABLE = "settings"
_SETTINGS_DEFAULTS = {
    "candidate_name": "", "candidate_email": "", "candidate_linkedin": "",
    "resume_url": "", "resume_filename": "Resume.pdf", "send_emails": False,
    "email_template": "", "followup_template": "",
    # migration 0002: default resume pointer + provider send cap
    "default_resume_id": None, "daily_send_cap": 40,
}


def get_settings(cfg: Config) -> dict[str, Any]:
    """Read the singleton Candidate Signature config; defaults if absent."""
    resp = get_client(cfg).table(SETTINGS_TABLE).select("*").eq("id", "singleton").limit(1).execute()
    row = (resp.data or [{}])[0]
    return {**_SETTINGS_DEFAULTS, **{k: v for k, v in row.items() if v is not None}}


def update_settings(cfg: Config, fields: dict[str, Any]) -> dict[str, Any]:
    """Patch the singleton settings row (service role)."""
    payload = {"id": "singleton", **{k: v for k, v in fields.items() if k in _SETTINGS_DEFAULTS}}
    get_client(cfg).table(SETTINGS_TABLE).upsert(payload, on_conflict="id").execute()
    return get_settings(cfg)


# ---------------------------------------------------------------------------
# Gmail OAuth (refresh token stored by the dashboard's connect flow)
# ---------------------------------------------------------------------------
GMAIL_AUTH_TABLE = "gmail_auth"


def get_gmail_auth(cfg: Config) -> dict[str, Any]:
    """Read the singleton gmail_auth row: {gmail_address, refresh_token, ...}."""
    resp = get_client(cfg).table(GMAIL_AUTH_TABLE).select("*").eq("id", "singleton").limit(1).execute()
    return (resp.data or [{}])[0]


def download_resume(cfg: Config) -> tuple[bytes, str] | tuple[None, None]:
    """Pull the resume file from the private `resumes` bucket (path in
    settings.resume_url) so the send layer can attach the real file."""
    profile = get_settings(cfg)
    path = str(profile.get("resume_url") or "").strip()
    if not path:
        return None, None
    data = get_client(cfg).storage.from_("resumes").download(path)
    return data, str(profile.get("resume_filename") or "Resume.pdf")


# ---------------------------------------------------------------------------
# Resumes (multi-resume table, migration 0002)
# ---------------------------------------------------------------------------
RESUMES_TABLE = "resumes"


def get_resume(cfg: Config, resume_id: str) -> dict[str, Any] | None:
    resp = get_client(cfg).table(RESUMES_TABLE).select("*").eq("id", resume_id).limit(1).execute()
    return (resp.data or [None])[0]


def download_resume_by_id(cfg: Config, resume_id: str) -> tuple[bytes, str, str] | tuple[None, None, None]:
    """Download a specific stored resume by id -> (bytes, filename, mime)."""
    row = get_resume(cfg, resume_id)
    if not row or not row.get("storage_path"):
        return None, None, None
    data = get_client(cfg).storage.from_("resumes").download(str(row["storage_path"]))
    return data, str(row.get("filename") or "Resume.pdf"), str(row.get("mime") or "application/pdf")


# ---------------------------------------------------------------------------
# Outreach queue (migration 0002) — the human-gated send pipeline
# ---------------------------------------------------------------------------
QUEUE_TABLE = "outreach_queue"


def get_sent_initial_map(cfg: Config) -> dict[str, str]:
    """job_id -> when its FIRST email actually went out.

    The follow-up gate anchors on this, not applications.applied_at: that column
    is also stamped by the dashboard's manual "Mark applied" button, so a lead
    nobody emailed would otherwise look due for a follow-up.
    """
    resp = (get_client(cfg).table(QUEUE_TABLE)
            .select("job_id,sent_at")
            .eq("kind", "initial").eq("status", "sent")
            .execute())
    out: dict[str, str] = {}
    for r in resp.data or []:
        jid, ts = r.get("job_id"), r.get("sent_at")
        if jid and ts and ts > out.get(jid, ""):
            out[jid] = ts
    return out


def get_due_queue_item(cfg: Config, now_iso: str) -> dict[str, Any] | None:
    """Oldest queued item whose scheduled_at has arrived. One per tick."""
    resp = (get_client(cfg).table(QUEUE_TABLE).select("*")
            .eq("status", "queued").lte("scheduled_at", now_iso)
            .order("scheduled_at", desc=False).limit(1).execute())
    return (resp.data or [None])[0]


def claim_queue_item(cfg: Config, item_id: str, prev_attempts: int) -> dict[str, Any] | None:
    """Atomically transition queued -> sending. The `.eq('status','queued')`
    guard means only ONE worker can win the row -> no double-send. Returns the
    claimed row, or None if another worker already took it."""
    resp = (get_client(cfg).table(QUEUE_TABLE)
            .update({"status": "sending", "attempts": prev_attempts + 1})
            .eq("id", item_id).eq("status", "queued").execute())
    return (resp.data or [None])[0]


def mark_queue_sent(cfg: Config, item_id: str, job_id: str, message_id: str, sent_iso: str,
                    kind: str = "initial") -> None:
    """Record a successful send.

    An initial email moves the lead to applied. A follow-up must NOT reset
    applied_at (that timestamp anchors the 24h follow-up gate and the reply
    window) — it stamps the follow-up marks instead.
    """
    client = get_client(cfg)
    client.table(QUEUE_TABLE).update({
        "status": "sent", "provider_message_id": message_id, "sent_at": sent_iso, "last_error": None,
    }).eq("id", item_id).execute()

    if kind == "followup":
        upsert(cfg, {"job_id": job_id, "status": "followed_up",
                     "followup_sent": True, "followup_date": sent_iso})
    else:
        upsert(cfg, {"job_id": job_id, "app_status": "applied", "applied_at": sent_iso})


def mark_queue_failed(cfg: Config, item_id: str, job_id: str, error: str) -> None:
    """Record a failed send: queue -> failed (retryable), lead app_status -> failed."""
    client = get_client(cfg)
    client.table(QUEUE_TABLE).update({
        "status": "failed", "last_error": error[:500],
    }).eq("id", item_id).execute()
    upsert(cfg, {"job_id": job_id, "app_status": "failed"})


def count_sent_today(cfg: Config, day_iso: str) -> int:
    """Emails actually sent today (provider daily-cap enforcement)."""
    resp = (get_client(cfg).table(QUEUE_TABLE).select("id", count="exact")
            .eq("status", "sent").gte("sent_at", day_iso).execute())
    return resp.count or 0


# ---------------------------------------------------------------------------
# Scrape-run stats (migration 0002) — one summary row per pipeline run
# ---------------------------------------------------------------------------
SCRAPE_RUNS_TABLE = "scrape_runs"


def insert_scrape_run(cfg: Config, summary: dict[str, Any]) -> None:
    get_client(cfg).table(SCRAPE_RUNS_TABLE).insert(summary).execute()


# ---------------------------------------------------------------------------
# Hunter usage counter (re-added; reuses the existing `usage` table)
# ---------------------------------------------------------------------------
USAGE_TABLE = "usage"


def get_hunter_calls(cfg: Config, day_iso: str) -> int:
    resp = get_client(cfg).table(USAGE_TABLE).select("hunter_calls").eq("day", day_iso).limit(1).execute()
    row = (resp.data or [{}])[0]
    return int(row.get("hunter_calls") or 0)


def get_hunter_calls_month(cfg: Config, month_prefix: str) -> int:
    """Searches spent so far in a calendar month ('YYYY-MM').

    Hunter's allowance resets monthly, not daily, so the monthly total is the
    cap that actually matters — a daily cap alone would burn a Free plan's whole
    month in two runs.
    """
    resp = (get_client(cfg).table(USAGE_TABLE)
            .select("hunter_calls")
            .gte("day", month_prefix + "-01")
            .lte("day", month_prefix + "-31")
            .execute())
    return sum(int((r or {}).get("hunter_calls") or 0) for r in (resp.data or []))


def hunter_remaining(cfg: Config, day_iso: str, month_prefix: str) -> int:
    """Searches this run may spend: the tighter of the daily and monthly caps.

    Shared by the scrape pipeline and the re-enrich worker so two runs on the
    same day draw from one allowance instead of each getting a full budget.
    """
    if not cfg.hunter_api_key:
        return 0
    daily = cfg.hunter_daily_cap - get_hunter_calls(cfg, day_iso)
    monthly = cfg.hunter_monthly_cap - get_hunter_calls_month(cfg, month_prefix)
    return max(0, min(daily, monthly))


def incr_hunter_calls(cfg: Config, day_iso: str, n: int = 1) -> None:
    current = get_hunter_calls(cfg, day_iso)
    get_client(cfg).table(USAGE_TABLE).upsert(
        {"day": day_iso, "hunter_calls": current + n}, on_conflict="day").execute()
