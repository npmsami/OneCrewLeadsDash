"""Recruiter-email enrichment — Extract Domain → Hunter → Apollo → Finalize.

Resolution order, best-first:
  1. Hunter.io domain-search (only if HUNTER_API_KEY is set and the daily cap is
     not exhausted). Finds professional recruiter/HR/eng emails.
  2. Apollo people-search (only if APOLLO_API_KEY is set).
  3. careers@<domain> pattern (only if a real company domain is known AND
     EMAIL_PATTERN_FALLBACK is on).
  4. Nothing -> status stays 'scored' and the pipeline routes to manual_apply.

Hunter is capped per day (config.hunter_daily_cap, tracked in the `usage` table)
so a paid plan's monthly credits aren't burned in one run. Missing emails, API
errors, rate limits and credit exhaustion are all handled gracefully: one bad
lookup never kills the run, and a rate/credit stop disables Hunter for the rest
of the run rather than hammering the API.
"""
from __future__ import annotations

import logging
import re
import threading
import time
from typing import Any
from urllib.parse import urlparse

import requests

from .config import Config

log = logging.getLogger(__name__)

_TIMEOUT = 30
_MIN_INTERVAL = 1.5  # n8n batchInterval 1500ms for Hunter/Apollo
_lock = threading.Lock()
_last_call = 0.0

# Job-board / ATS hosts that are NOT a company's own domain.
BOARD_HOSTS = {
    "remoteok.com", "remotive.com", "remotive.io", "arbeitnow.com", "jobicy.com",
    "himalayas.app", "weworkremotely.com", "greenhouse.io", "lever.co", "ashbyhq.com",
    "workable.com", "linkedin.com", "indeed.com", "bamboohr.com", "smartrecruiters.com",
    "recruitee.com", "breezy.hr", "jobvite.com", "wellfound.com", "myworkdayjobs.com",
    "icims.com", "notion.site", "typeform.com", "google.com", "gem.com", "rippling.com",
    "dover.com",
}
_SUBDOMAIN_STRIP = re.compile(r"^(jobs|careers|career|apply|hire|boards|job|work)\.")

_APOLLO_BAD = re.compile(r"not_unlocked|domain\.com$")


def _throttle() -> None:
    global _last_call
    with _lock:
        wait = _MIN_INTERVAL - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()


def _try_host(u: str) -> str:
    try:
        host = (urlparse(str(u)).hostname or "").lower()
    except ValueError:
        return ""
    if not host:
        return ""
    host = re.sub(r"^www\.", "", host)
    if any(host == b or host.endswith("." + b) for b in BOARD_HOSTS):
        return ""
    return _SUBDOMAIN_STRIP.sub("", host)


def extract_domain(ctx: dict[str, Any]) -> str:
    """Best-effort company domain; job-board hosts don't count."""
    domain = ""
    if ctx.get("company_website"):
        domain = _try_host(ctx["company_website"])
    if not domain:
        domain = _try_host(ctx.get("job_url", ""))
    return domain


# ---------------------------------------------------------------------------
# Hunter.io domain-search (primary provider)
# ---------------------------------------------------------------------------
# Prefer HR/recruiting/executive contacts; personal addresses over generic
# inboxes (info@/contact@). Lower key sorts first.
_HUNTER_DEPT_RANK = {
    "hr": 0, "executive": 1, "management": 2, "operations": 3,
    "engineering": 4, "it": 5,
}


def hunter_search(ctx: dict[str, Any], cfg: Config) -> dict[str, Any]:
    """Query Hunter domain-search. Returns {status, data?}. status is one of
    'ok' (a credit was spent), 'rate_limited' (429 / monthly credits gone ->
    caller should stop Hunter for the run), 'skip' (no domain), 'error'."""
    domain = ctx.get("company_domain")
    if not domain:
        return {"status": "skip"}
    _throttle()
    try:
        resp = requests.get(
            "https://api.hunter.io/v2/domain-search",
            params={"domain": domain, "api_key": cfg.hunter_api_key, "limit": 20},
            timeout=_TIMEOUT,
        )
    except Exception as exc:  # noqa: BLE001 — transient network issue
        log.warning("Hunter lookup failed for %s: %s", domain, exc)
        return {"status": "error"}
    if resp.status_code == 429:  # rate limit OR monthly-credit exhaustion
        return {"status": "rate_limited"}
    if resp.status_code >= 400:
        try:
            detail = resp.json().get("errors")
        except Exception:  # noqa: BLE001
            detail = resp.text[:200]
        log.warning("Hunter %s for %s: %s", resp.status_code, domain, detail)
        # 4xx that mentions usage/limit -> treat like a stop signal, else transient.
        if any(w in str(detail).lower() for w in ("usage", "limit", "credit", "quota")):
            return {"status": "rate_limited"}
        return {"status": "error"}
    try:
        return {"status": "ok", "data": resp.json().get("data") or {}}
    except Exception:  # noqa: BLE001
        return {"status": "error"}


def pick_hunter(ctx: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    """Choose the best email from a Hunter domain-search response."""
    emails = (data or {}).get("emails") or []
    best = None
    best_key: tuple | None = None
    for e in emails:
        val = str((e or {}).get("value") or "")
        if "@" not in val:
            continue
        dept = str(e.get("department") or "").lower()
        etype = str(e.get("type") or "").lower()   # personal | generic
        conf = int(e.get("confidence") or 0)
        key = (_HUNTER_DEPT_RANK.get(dept, 8), 0 if etype == "personal" else 1, -conf)
        if best_key is None or key < best_key:
            best_key, best = key, e
    if best:
        ctx["recruiter_email"] = str(best["value"])
        name = " ".join(filter(None, [best.get("first_name"), best.get("last_name")])).strip()
        ctx["recruiter_name"] = ctx.get("recruiter_name") or name or "Hiring Team"
        conf = int(best.get("confidence") or 0)
        ctx["email_confidence"] = "high" if conf >= 80 else "medium" if conf >= 50 else "low"
        ctx["email_source"] = "hunter"
    return ctx


# ---------------------------------------------------------------------------
# Apollo (secondary enrichment provider)
# ---------------------------------------------------------------------------
_APOLLO_TITLES = [
    "Technical Recruiter", "Recruiter", "Talent Acquisition Specialist", "Head of Talent",
    "HR Manager", "Engineering Manager", "Head of Engineering", "CTO",
]


def apollo_search(ctx: dict[str, Any], cfg: Config) -> dict[str, Any]:
    body = {
        "q_organization_domains": ctx.get("company_domain") or None,
        "q_organization_name": ctx.get("company"),
        "person_titles": _APOLLO_TITLES,
        "page": 1,
        "per_page": 5,
    }
    headers = {"Content-Type": "application/json", "X-Api-Key": cfg.apollo_api_key}
    _throttle()
    try:
        resp = requests.post("https://api.apollo.io/api/v1/mixed_people/search",
                             headers=headers, json=body, timeout=_TIMEOUT)
        return resp.json()
    except Exception as exc:  # noqa: BLE001
        log.warning("Apollo lookup failed: %s", exc)
        return {}


def pick_apollo(ctx: dict[str, Any], response: dict[str, Any]) -> dict[str, Any]:
    people = (response or {}).get("people") or (response or {}).get("contacts") or []
    for p in people:
        em = str((p or {}).get("email") or "")
        if em and "@" in em and not _APOLLO_BAD.search(em):
            ctx["recruiter_email"] = em
            ctx["recruiter_name"] = str(p.get("name")
                                        or " ".join(filter(None, [p.get("first_name"), p.get("last_name")]))
                                        or "Hiring Team")
            ctx["email_confidence"] = "medium"
            ctx["email_source"] = "apollo"
            break
    return ctx


# ---------------------------------------------------------------------------
# Finalize
# ---------------------------------------------------------------------------
def finalize_email(ctx: dict[str, Any], use_pattern: bool = True) -> dict[str, Any]:
    # careers@<domain> is only a guess; skip it unless explicitly enabled (it
    # produces wrong emails for reposter/hosting domains, and manual apply needs
    # no email anyway). Without a real email the job routes to manual_apply.
    if use_pattern and not ctx.get("recruiter_email") and ctx.get("company_domain"):
        ctx["recruiter_email"] = "careers@" + ctx["company_domain"].lower()
        ctx["recruiter_name"] = ctx.get("recruiter_name") or "Hiring Team"
        ctx["email_confidence"] = "medium"
        ctx["email_source"] = "pattern"
    ctx["recruiter_name"] = ctx.get("recruiter_name") or "Hiring Team"
    ctx["email_found"] = bool(ctx.get("recruiter_email"))
    ctx["status"] = "enriched" if ctx["email_found"] else "scored"
    return ctx


def enrich(ctx: dict[str, Any], cfg: Config, hunter_state: dict[str, Any] | None = None) -> dict[str, Any]:
    """Enrichment chain for one scored job: Hunter -> Apollo -> optional pattern.

    `hunter_state` is a small mutable per-run budget the pipeline threads through:
        {"remaining": int, "used": int, "disabled": bool}
    It caps Hunter calls across the run and short-circuits once the daily cap is
    reached or Hunter reports a rate/credit limit.
    """
    ctx["company_domain"] = extract_domain(ctx)

    if (not ctx.get("recruiter_email") and cfg.hunter_api_key and ctx["company_domain"]
            and hunter_state is not None and not hunter_state.get("disabled")
            and hunter_state.get("remaining", 0) > 0):
        res = hunter_search(ctx, cfg)
        status = res.get("status")
        if status == "ok":
            hunter_state["remaining"] -= 1
            hunter_state["used"] = hunter_state.get("used", 0) + 1
            ctx = pick_hunter(ctx, res.get("data") or {})
        elif status == "rate_limited":
            hunter_state["disabled"] = True
            log.warning("Hunter rate/credit limit hit -> Hunter disabled for the rest of this run")
        # 'error'/'skip' -> just fall through to the next provider

    if not ctx.get("recruiter_email") and cfg.apollo_api_key:
        ctx = pick_apollo(ctx, apollo_search(ctx, cfg))

    return finalize_email(ctx, use_pattern=cfg.email_pattern_fallback)
