"""Signed unsubscribe links — shared scheme with the dashboard's src/lib/unsub.ts.

token = first 24 hex chars of HMAC-SHA256(SUPABASE_SERVICE_ROLE_KEY, "unsub:"+email).
Reusing the service-role key as the signing secret means no extra secret to
configure (the agent and the dashboard both already hold it). The token stops a
recipient from unsubscribing arbitrary addresses by editing the URL.
"""
from __future__ import annotations

import hashlib
import hmac
from urllib.parse import quote

from .config import Config


def token_for(cfg: Config, email: str) -> str:
    key = (cfg.supabase_service_role_key or "").encode()
    msg = ("unsub:" + email.strip().lower()).encode()
    return hmac.new(key, msg, hashlib.sha256).hexdigest()[:24]


def unsubscribe_url(cfg: Config, app_url: str, email: str) -> str:
    """Per-recipient one-click unsubscribe URL, or "" if no app_url is configured."""
    base = (app_url or "").strip().rstrip("/")
    if not base:
        return ""
    return f"{base}/api/unsubscribe?e={quote(email.strip().lower())}&t={token_for(cfg, email)}"
