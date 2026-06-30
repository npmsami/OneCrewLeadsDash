"""Storage for the website-audit automation — Supabase audit_leads/audit_settings.

Reuses the base agent's Supabase client (agent.store.get_client). audit_leads is
keyed on the lowercased contact `email` (the n8n "Contact Email" matching column),
so re-processing a lead is an idempotent upsert.
"""
from __future__ import annotations

from typing import Any

from ..config import Config
from .. import store as base

LEADS_TABLE = "audit_leads"
SETTINGS_TABLE = "audit_settings"

# Real columns on audit_leads (from supabase/audit_schema.sql). Anything else in
# a context dict is dropped before write.
VALID_COLUMNS = {
    "email", "first_name", "full_name", "company", "job_title", "phone", "city",
    "state", "industry", "revenue", "employees", "website", "domain", "subject",
    "ai_business_name", "ai_summary", "ai_gaps", "email_html", "status",
    "skip_reason", "error", "sent_at",
}
# timestamptz cols where '' must become SQL NULL.
_NULLABLE_TYPED = {"sent_at"}

_SETTINGS_DEFAULTS: dict[str, Any] = {
    "agency_name": "OneCrew Technologies",
    "tagline": "We ship. You scale.",
    "sender_name": "",
    "sender_title": "",
    "sender_email": "",
    "sender_phone": "",
    "sender_address": "",
    "unsubscribe_url": "",
    "calendar_link": "",
    "website_url": "",
    "hero_url": "",
    "logo_url": "",
    "sign_img_url": "",
    "daily_send_cap": 40,
    "send_emails": False,
}


def get_client(cfg: Config):
    return base.get_client(cfg)


def _clean(row: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in row.items():
        if k not in VALID_COLUMNS:
            continue
        if v == "" and k in _NULLABLE_TYPED:
            v = None
        out[k] = v
    return out


def get_settings(cfg: Config) -> dict[str, Any]:
    """Read the singleton audit_settings row; defaults if absent."""
    resp = get_client(cfg).table(SETTINGS_TABLE).select("*").eq("id", "singleton").limit(1).execute()
    row = (resp.data or [{}])[0]
    return {**_SETTINGS_DEFAULTS, **{k: v for k, v in row.items() if v is not None}}


def get_pending_leads(cfg: Config, limit: int) -> list[dict[str, Any]]:
    """Leads awaiting processing (status='pending'), oldest first, up to `limit`."""
    resp = (
        get_client(cfg).table(LEADS_TABLE).select("*")
        .eq("status", "pending")
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return resp.data or []


def update_lead(cfg: Config, email: str, fields: dict[str, Any]) -> None:
    """Patch one lead row (service role), keyed on email."""
    payload = _clean(fields)
    if not payload:
        return
    get_client(cfg).table(LEADS_TABLE).update(payload).eq("email", email).execute()


def upsert_lead(cfg: Config, row: dict[str, Any]) -> None:
    """Insert-or-update a lead, keyed on email (used by CSV intake)."""
    payload = _clean(row)
    if not payload.get("email"):
        raise ValueError("upsert_lead requires email")
    get_client(cfg).table(LEADS_TABLE).upsert(payload, on_conflict="email").execute()


def delete_lead(cfg: Config, email: str) -> None:
    """Test/maintenance helper — remove one lead by email."""
    get_client(cfg).table(LEADS_TABLE).delete().eq("email", email).execute()
