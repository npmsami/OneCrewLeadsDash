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
}

# Typed columns where an empty string is invalid and must become SQL NULL.
_NULLABLE_TYPED = {
    "posted_date", "scraped_at", "applied_at", "reply_date", "followup_date",  # timestamptz
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


# ---------------------------------------------------------------------------
# Candidate Signature settings (singleton row, edited from the dashboard)
# ---------------------------------------------------------------------------
SETTINGS_TABLE = "settings"
_SETTINGS_DEFAULTS = {
    "candidate_name": "", "candidate_email": "", "candidate_linkedin": "",
    "resume_url": "", "resume_filename": "Resume.pdf", "send_emails": False,
    "email_template": "", "followup_template": "",
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
