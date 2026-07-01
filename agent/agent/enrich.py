"""Recruiter-email enrichment — port of the Extract Domain → Hunter → Apollo →
Finalize chain (CODE.extractDomain / pickHunter / pickApollo / finalizeEmail).

Resolution order, best-first:
  1. Hunter domain-search (free 25/mo) — ranks recruiting/HR > generic careers@
     > eng leadership > confidence.
  2. Apollo people-search (only if Hunter found nothing AND APOLLO_API_KEY set).
  3. careers@<domain> pattern (only if a real company domain is known).
  4. Nothing -> status stays 'scored' and the pipeline routes to manual_apply.
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

_RANK_RECRUITER = re.compile(r"(recruit|talent|people ops|people operations|\bhr\b|human resources|hiring)")
_RANK_GENERIC = re.compile(r"(careers|jobs|talent|recruiting|hiring|hr)@")
_RANK_LEADERSHIP = re.compile(r"(engineering manager|head of engineering|vp (of )?engineering|cto|co-?founder|founder)")
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
# Hunter
# ---------------------------------------------------------------------------
def hunter_search(domain: str, company: str, cfg: Config) -> dict[str, Any]:
    params = {"api_key": cfg.hunter_api_key, "limit": 10}
    if domain:
        params["domain"] = domain
    else:
        params["company"] = company
    _throttle()
    try:
        resp = requests.get("https://api.hunter.io/v2/domain-search", params=params, timeout=_TIMEOUT)
        return resp.json()
    except Exception as exc:  # noqa: BLE001
        log.warning("Hunter lookup failed: %s", exc)
        return {}


def _rank(e: dict[str, Any]) -> int:
    pos = str(e.get("position") or "").lower()
    val = str(e.get("value") or "").lower()
    if _RANK_RECRUITER.search(pos):
        return 400
    if _RANK_GENERIC.search(val):
        return 300
    if _RANK_LEADERSHIP.search(pos):
        return 200
    if e.get("type") == "generic":
        return 50
    return 100


def pick_hunter(ctx: dict[str, Any], response: dict[str, Any]) -> dict[str, Any]:
    d = (response or {}).get("data") or {}
    emails = d.get("emails") if isinstance(d.get("emails"), list) else []
    if d.get("domain") and not ctx.get("company_domain"):
        ctx["company_domain"] = str(d["domain"]).lower()

    best, best_score = None, -1.0
    for e in emails:
        if not e or not e.get("value"):
            continue
        s = _rank(e) + (float(e.get("confidence") or 0) / 100)
        if s > best_score:
            best, best_score = e, s

    ctx["recruiter_email"] = ""
    ctx["recruiter_name"] = ""
    ctx["email_confidence"] = ""
    ctx["email_source"] = ""
    if best:
        ctx["recruiter_email"] = str(best["value"])
        ctx["recruiter_name"] = " ".join(filter(None, [best.get("first_name"), best.get("last_name")])) or "Hiring Team"
        c = float(best.get("confidence") or 0)
        ctx["email_confidence"] = "high" if c >= 70 else ("medium" if c >= 40 else "low")
        ctx["email_source"] = "hunter"
    return ctx


# ---------------------------------------------------------------------------
# Apollo (fallback)
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


def enrich(ctx: dict[str, Any], cfg: Config) -> dict[str, Any]:
    """Full enrichment chain for one scored job."""
    ctx["company_domain"] = extract_domain(ctx)

    if cfg.hunter_api_key:
        ctx = pick_hunter(ctx, hunter_search(ctx["company_domain"], ctx.get("company", ""), cfg))

    if not ctx.get("recruiter_email") and cfg.apollo_api_key:
        ctx = pick_apollo(ctx, apollo_search(ctx, cfg))

    return finalize_email(ctx, use_pattern=cfg.email_pattern_fallback)
