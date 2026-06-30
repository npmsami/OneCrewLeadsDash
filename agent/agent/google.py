"""Gmail layer — headless send + inbox read (the go-live layer).

The dashboard's Gmail-connect flow stored a refresh token in the locked
`gmail_auth` table. Here we exchange it (with GOOGLE_CLIENT_ID/SECRET) for a
short-lived access token and call the Gmail REST API directly with plain
`requests` — matching the rest of the agent (no google client libraries),
which keeps the GitHub Actions image small.

Public surface (consumed by pipeline.py send + followup.py reply-detection):
  is_ready(cfg)   -> bool   — creds + refresh token all present?
  send_email(...) -> message id
  fetch_inbox(cfg)-> [{"sender": <lowercased email>, "ts": <aware datetime>}]
                     exactly the shape followup.select_due() expects.
"""
from __future__ import annotations

import base64
import logging
import time
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import parseaddr
from typing import Any

import requests

from .config import Config
from . import store

log = logging.getLogger(__name__)

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"
_TIMEOUT = 30


class GmailNotReady(RuntimeError):
    """Raised when send/read is attempted before Gmail is fully configured."""


# ---------------------------------------------------------------------------
# Auth — refresh token -> access token (cached for its lifetime)
# ---------------------------------------------------------------------------
_token_cache: dict[str, Any] = {"value": "", "expires_at": 0.0, "address": ""}


def is_ready(cfg: Config) -> bool:
    """True when the OAuth client creds AND a stored refresh token both exist."""
    if not (cfg.google_client_id and cfg.google_client_secret):
        return False
    return bool(store.get_gmail_auth(cfg).get("refresh_token"))


def access_token(cfg: Config) -> tuple[str, str]:
    """Return (access_token, gmail_address). Cached until ~1 min before expiry."""
    now = time.time()
    if _token_cache["value"] and now < _token_cache["expires_at"]:
        return _token_cache["value"], _token_cache["address"]

    auth = store.get_gmail_auth(cfg)
    refresh_token = str(auth.get("refresh_token") or "").strip()
    if not refresh_token:
        raise GmailNotReady("no refresh token in gmail_auth — connect Gmail on the dashboard first")
    if not (cfg.google_client_id and cfg.google_client_secret):
        raise GmailNotReady("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing from env")

    resp = requests.post(_TOKEN_URL, data={
        "client_id": cfg.google_client_id,
        "client_secret": cfg.google_client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }, timeout=_TIMEOUT)
    body = resp.json()
    if resp.status_code != 200 or not body.get("access_token"):
        raise GmailNotReady(f"token refresh failed ({resp.status_code}): {body.get('error_description') or body}")

    _token_cache["value"] = body["access_token"]
    _token_cache["expires_at"] = now + int(body.get("expires_in", 3600)) - 60
    _token_cache["address"] = str(auth.get("gmail_address") or "")
    return _token_cache["value"], _token_cache["address"]


def _headers(cfg: Config) -> dict[str, str]:
    token, _ = access_token(cfg)
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Send
# ---------------------------------------------------------------------------
def build_raw(to: str, subject: str, body: str, from_addr: str = "",
              attachment: bytes | None = None, filename: str = "Resume.pdf") -> str:
    """Assemble a plain-text email (optional PDF attachment) -> base64url raw."""
    msg = EmailMessage()
    msg["To"] = to
    msg["Subject"] = subject
    if from_addr:
        msg["From"] = from_addr
    msg.set_content(body)
    if attachment:
        msg.add_attachment(attachment, maintype="application", subtype="pdf", filename=filename)
    return base64.urlsafe_b64encode(msg.as_bytes()).decode()


def send_email(cfg: Config, to: str, subject: str, body: str,
               attachment: bytes | None = None, filename: str = "Resume.pdf") -> str:
    """Send one plain-text email via Gmail. Returns the sent message id."""
    _, from_addr = access_token(cfg)
    raw = build_raw(to, subject, body, from_addr, attachment, filename)
    resp = requests.post(f"{_GMAIL_API}/messages/send", headers=_headers(cfg),
                         json={"raw": raw}, timeout=_TIMEOUT)
    if resp.status_code != 200:
        raise GmailNotReady(f"send failed ({resp.status_code}): {resp.text[:300]}")
    return str(resp.json().get("id") or "")


def build_html_raw(to: str, subject: str, html: str, text_fallback: str = "",
                   from_addr: str = "", headers: dict[str, str] | None = None) -> str:
    """Assemble a multipart/alternative email (plain-text + HTML) -> base64url raw.

    `headers` adds extra top-level headers (e.g. List-Unsubscribe) — important
    for bulk deliverability."""
    msg = EmailMessage()
    msg["To"] = to
    msg["Subject"] = subject
    if from_addr:
        msg["From"] = from_addr
    for k, v in (headers or {}).items():
        if v:
            msg[k] = v
    msg.set_content(text_fallback or "This email is best viewed in an HTML-capable client.")
    msg.add_alternative(html, subtype="html")
    return base64.urlsafe_b64encode(msg.as_bytes()).decode()


def send_html_email(cfg: Config, to: str, subject: str, html: str, text_fallback: str = "",
                    headers: dict[str, str] | None = None) -> str:
    """Send one HTML email via Gmail (used by the website-audit automation)."""
    _, from_addr = access_token(cfg)
    raw = build_html_raw(to, subject, html, text_fallback, from_addr, headers)
    resp = requests.post(f"{_GMAIL_API}/messages/send", headers=_headers(cfg),
                         json={"raw": raw}, timeout=_TIMEOUT)
    if resp.status_code != 200:
        raise GmailNotReady(f"send failed ({resp.status_code}): {resp.text[:300]}")
    return str(resp.json().get("id") or "")


# ---------------------------------------------------------------------------
# Inbox read (for reply detection)
# ---------------------------------------------------------------------------
def fetch_inbox(cfg: Config, newer_than_days: int = 30, max_messages: int = 150) -> list[dict[str, Any]]:
    """Recent inbox senders + timestamps, for followup.select_due().

    Returns [{"sender": <lowercased email>, "ts": <aware datetime>}]. On any
    failure (not connected, API error) returns [] so the follow-up engine
    degrades to time-based only rather than crashing the cron."""
    try:
        headers = _headers(cfg)
    except GmailNotReady as exc:
        log.warning("inbox skipped: %s", exc)
        return []

    try:
        listing = requests.get(
            f"{_GMAIL_API}/messages", headers=headers, timeout=_TIMEOUT,
            params={"q": f"in:inbox newer_than:{newer_than_days}d", "maxResults": max_messages},
        ).json()
    except Exception as exc:  # noqa: BLE001
        log.warning("inbox list failed: %s", exc)
        return []

    out: list[dict[str, Any]] = []
    for ref in listing.get("messages") or []:
        try:
            m = requests.get(
                f"{_GMAIL_API}/messages/{ref['id']}", headers=headers, timeout=_TIMEOUT,
                params={"format": "metadata", "metadataHeaders": "From"},
            ).json()
        except Exception as exc:  # noqa: BLE001
            log.warning("inbox get %s failed: %s", ref.get("id"), exc)
            continue
        sender = _from_email(m)
        ts = _internal_ts(m)
        if sender and ts:
            out.append({"sender": sender, "ts": ts})
    return out


def _from_email(message: dict[str, Any]) -> str:
    headers = ((message.get("payload") or {}).get("headers")) or []
    for h in headers:
        if str(h.get("name", "")).lower() == "from":
            return parseaddr(str(h.get("value") or ""))[1].lower()
    return ""


def _internal_ts(message: dict[str, Any]) -> datetime | None:
    raw = message.get("internalDate")
    if not raw:
        return None
    try:
        return datetime.fromtimestamp(int(raw) / 1000, tz=timezone.utc)
    except (ValueError, TypeError, OverflowError):
        return None
