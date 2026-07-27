"""Recruiter-email enrichment — Resolve company → Hunter → Apollo → Finalize.

Resolution order, best-first:
  1. Hunter.io domain-search (only if HUNTER_API_KEY is set and the daily cap is
     not exhausted). Searched by company DOMAIN when we know one, otherwise by
     company NAME — Hunter resolves the name to a domain itself. The name path
     is what makes LinkedIn leads work: their job_url is linkedin.com (a board
     host), so domain extraction yields nothing and a domain-only lookup would
     silently skip every LinkedIn job.
  2. Apollo people-search (only if APOLLO_API_KEY is set) — searched by the
     domain Hunter resolved, else by company name.
  3. careers@<domain> pattern (only if a real company domain is known AND
     EMAIL_PATTERN_FALLBACK is on).
  4. Nothing -> status stays 'scored' and the pipeline routes to manual_apply.

Hunter is capped per day (config.hunter_daily_cap, tracked in the `usage` table)
so a plan's monthly searches aren't burned in one run, and results are cached
per company for the whole run so ten jobs at one company cost ONE search.
Missing emails, API errors, rate limits and credit exhaustion are all handled
gracefully: one bad lookup never kills the run, and a rate/credit stop disables
the provider for the rest of the run rather than hammering the API.
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
    "dover.com", "builtin.com", "builtinsf.com", "builtinnyc.com", "ziprecruiter.com",
    "glassdoor.com", "monster.com", "dice.com", "jobleads.com", "liveblog365.com",
}
_SUBDOMAIN_STRIP = re.compile(r"^(jobs|careers|career|apply|hire|boards|job|work)\.")

_APOLLO_BAD = re.compile(r"not_unlocked|email_not_unlocked|domain\.com$")

# Company names that are job reposters / aggregators, not real employers. A
# lookup against these burns a search and can only return a useless address, so
# they never reach a provider. Matched on the normalized name.
REPOSTER_COMPANIES = {
    "jobhub", "job hub", "jobleads", "job leads", "liveblog365", "hire feed",
    "hirefeed", "jobs via dice", "get it recruit", "talentify", "lensa",
    "jobot", "crossover", "remote jobs", "confidential", "undisclosed",
    "recruiting from scratch", "carrus", "energy jobline",
}

# Legal suffixes stripped before a name-based lookup ("Acme Inc." -> "acme").
_LEGAL_SUFFIX = re.compile(
    r"[\s,]+(inc|llc|ltd|limited|corp|corporation|co|company|gmbh|bv|nv|ag|sa|srl|plc|pvt|pte|llp)\.?$",
    re.IGNORECASE,
)


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


def normalize_company(name: Any) -> str:
    """Lowercased, suffix-stripped company name used for lookups + caching."""
    n = re.sub(r"\s+", " ", str(name or "")).strip()
    n = _LEGAL_SUFFIX.sub("", n).strip(" .,-")
    return n.lower()


def is_lookupable(ctx: dict[str, Any]) -> bool:
    """True when we have something a provider can actually search on: a real
    company domain, or a company name that isn't a reposter/placeholder."""
    if ctx.get("company_domain"):
        return True
    name = normalize_company(ctx.get("company"))
    return len(name) >= 2 and name not in REPOSTER_COMPANIES


def cache_key(ctx: dict[str, Any]) -> str:
    """One lookup per company per run — domain when known, else the name."""
    return (ctx.get("company_domain") or "").lower() or "name:" + normalize_company(ctx.get("company"))


# Fields a provider result contributes; also the shape of a cache entry.
_RESULT_FIELDS = ("recruiter_email", "recruiter_name", "email_confidence", "email_source", "company_domain")


def _harvest(ctx: dict[str, Any]) -> dict[str, Any]:
    return {k: ctx[k] for k in _RESULT_FIELDS if ctx.get(k)}


def _apply(ctx: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    for k, v in (result or {}).items():
        if v:
            ctx[k] = v
    return ctx


# ---------------------------------------------------------------------------
# Hunter.io domain-search (primary provider)
# ---------------------------------------------------------------------------
# Job TITLE is the strongest signal for "who reads applications" — Hunter's
# `department` field is coarse (a "Talent Referrals Partner" lands in
# "executive"), so titles are scored first and department only breaks ties.
_TITLE_RANK = (
    (re.compile(r"talent acquisition|technical recruiter|recruit|sourcer", re.I), 0),
    (re.compile(r"\btalent\b|\bhiring\b|people ops|people operations|\bhr\b|human resources", re.I), 1),
    (re.compile(r"head of engineering|engineering manager|\bcto\b|vp.{0,10}engineering", re.I), 3),
    (re.compile(r"founder|chief|\bceo\b|\bcoo\b", re.I), 4),
)
# Prefer HR/recruiting/executive contacts; personal addresses over generic
# inboxes (info@/contact@). Lower key sorts first.
_HUNTER_DEPT_RANK = {
    "hr": 0, "executive": 1, "management": 2, "operations": 3,
    "engineering": 4, "it": 5,
}

# Hunter's Free plan returns at most 10 emails per search and 400s on more.
_RESULT_LIMIT = 10
# Hunter error ids that mean "allowance gone" -> stop calling for this run.
_HUNTER_STOP_IDS = {"usage_limit_reached", "too_many_requests", "credits_exhausted", "forbidden"}


def _title_rank(position: Any) -> int:
    text = str(position or "")
    for pattern, rank in _TITLE_RANK:
        if pattern.search(text):
            return rank
    return 5   # unknown/irrelevant title — department decides


def hunter_search(ctx: dict[str, Any], cfg: Config) -> dict[str, Any]:
    """Query Hunter domain-search by domain (preferred) or company name.

    Returns {status, data?}. status is one of 'ok' (a search was spent),
    'rate_limited' (429 / monthly searches gone -> caller should stop Hunter for
    the run), 'skip' (nothing searchable), 'error'."""
    # limit=10: Hunter's Free plan rejects anything higher with a 400
    # pagination_error, and the ranking only ever needs the top handful.
    params: dict[str, Any] = {"api_key": cfg.hunter_api_key, "limit": _RESULT_LIMIT}
    if ctx.get("company_domain"):
        params["domain"] = ctx["company_domain"]
    elif is_lookupable(ctx):
        # Hunter resolves a company NAME to its domain server-side. This is the
        # only path that works for LinkedIn-sourced jobs.
        params["company"] = str(ctx.get("company") or "").strip()
    else:
        return {"status": "skip"}
    _throttle()
    try:
        resp = requests.get("https://api.hunter.io/v2/domain-search", params=params, timeout=_TIMEOUT)
    except Exception as exc:  # noqa: BLE001 — transient network issue
        log.warning("Hunter lookup failed for %s: %s", params.get("domain") or params.get("company"), exc)
        return {"status": "error"}
    if resp.status_code == 429:  # rate limit OR monthly-credit exhaustion
        return {"status": "rate_limited"}
    if resp.status_code >= 400:
        try:
            errors = resp.json().get("errors") or []
        except Exception:  # noqa: BLE001
            errors = [{"details": resp.text[:200]}]
        target = params.get("domain") or params.get("company")
        log.warning("Hunter %s for %s: %s", resp.status_code, target, errors)
        ids = {str((e or {}).get("id") or "").lower() for e in errors}
        # A pagination_error means our `limit` exceeds what the plan returns —
        # a request problem, NOT an exhausted allowance. Misreading it as a
        # credit stop would silently disable Hunter for the whole run.
        if ids & _HUNTER_STOP_IDS:
            return {"status": "rate_limited"}
        if "pagination_error" in ids:
            return {"status": "error"}
        # Unrecognised 4xx: fall back to wording, but never on pagination.
        if any(w in str(errors).lower() for w in ("usage", "credit", "quota", "upgrade")):
            return {"status": "rate_limited"}
        return {"status": "error"}
    try:
        return {"status": "ok", "data": resp.json().get("data") or {}}
    except Exception:  # noqa: BLE001
        return {"status": "error"}


def pick_hunter(ctx: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    """Choose the best email from a Hunter domain-search response.

    Also records the domain Hunter resolved, so a name-based lookup still leaves
    us with a usable company domain for Apollo/pattern fallback and the UI."""
    data = data or {}
    if data.get("domain") and not ctx.get("company_domain"):
        ctx["company_domain"] = str(data["domain"]).lower()

    best = None
    best_key: tuple | None = None
    for e in data.get("emails") or []:
        val = str((e or {}).get("value") or "")
        if "@" not in val:
            continue
        dept = str(e.get("department") or "").lower()
        etype = str(e.get("type") or "").lower()   # personal | generic
        conf = int(e.get("confidence") or 0)
        key = (_title_rank(e.get("position")), _HUNTER_DEPT_RANK.get(dept, 8),
               0 if etype == "personal" else 1, -conf)
        if best_key is None or key < best_key:
            best_key, best = key, e
    if best:
        ctx["recruiter_email"] = str(best["value"])
        name = " ".join(filter(None, [best.get("first_name"), best.get("last_name")])).strip()
        ctx["recruiter_name"] = ctx.get("recruiter_name") or name or "Hiring Team"
        conf = int(best.get("confidence") or 0)
        ctx["email_confidence"] = "high" if conf >= 80 else "medium" if conf >= 50 else "low"
        ctx["email_source"] = "hunter"
        if best.get("position"):
            ctx["recruiter_title"] = str(best["position"])
    return ctx


# ---------------------------------------------------------------------------
# Apollo (secondary enrichment provider)
# ---------------------------------------------------------------------------
_APOLLO_TITLES = [
    "Technical Recruiter", "Recruiter", "Talent Acquisition Specialist", "Head of Talent",
    "HR Manager", "Engineering Manager", "Head of Engineering", "CTO",
]


def apollo_search(ctx: dict[str, Any], cfg: Config) -> dict[str, Any]:
    """Query Apollo people-search by domain (preferred) or company name.

    Returns the raw JSON, or {} on any transport error. A 4xx that signals plan
    limits is surfaced as {"_stop": True} so the caller can disable Apollo for
    the rest of the run (free Apollo plans reject the search API outright)."""
    if not is_lookupable(ctx):
        return {}
    body: dict[str, Any] = {
        "person_titles": _APOLLO_TITLES,
        "page": 1,
        "per_page": 5,
    }
    if ctx.get("company_domain"):
        body["q_organization_domains"] = ctx["company_domain"]
    if ctx.get("company"):
        body["q_organization_name"] = str(ctx["company"]).strip()
    headers = {"Content-Type": "application/json", "X-Api-Key": cfg.apollo_api_key}
    _throttle()
    try:
        resp = requests.post("https://api.apollo.io/api/v1/mixed_people/search",
                             headers=headers, json=body, timeout=_TIMEOUT)
    except Exception as exc:  # noqa: BLE001
        log.warning("Apollo lookup failed: %s", exc)
        return {}
    if resp.status_code in (401, 403, 422, 429):
        log.warning("Apollo %s (plan/limit) -> Apollo disabled for this run: %s",
                    resp.status_code, resp.text[:200])
        return {"_stop": True}
    if resp.status_code >= 400:
        log.warning("Apollo %s: %s", resp.status_code, resp.text[:200])
        return {}
    try:
        return resp.json() or {}
    except Exception:  # noqa: BLE001
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
            if p.get("title"):
                ctx["recruiter_title"] = str(p["title"])
            org = (p.get("organization") or {}) if isinstance(p.get("organization"), dict) else {}
            if org.get("primary_domain") and not ctx.get("company_domain"):
                ctx["company_domain"] = str(org["primary_domain"]).lower()
            break
    return ctx


# ---------------------------------------------------------------------------
# Finalize
# ---------------------------------------------------------------------------
def finalize_email(ctx: dict[str, Any], use_pattern: bool = True) -> dict[str, Any]:
    # careers@<domain> is only a guess; skip it unless explicitly enabled (it
    # produces wrong emails for reposter/hosting domains). Without a real email
    # the job routes to manual_apply.
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

    `hunter_state` is the mutable per-run budget the pipeline threads through:
        {"remaining": int, "used": int, "disabled": bool,
         "cache": {company_key: result}, "apollo_disabled": bool}
    It caps Hunter searches across the run, short-circuits once the daily cap is
    reached or a provider reports a rate/credit limit, and reuses one lookup for
    every job at the same company.
    """
    ctx["company_domain"] = extract_domain(ctx)
    state = hunter_state if hunter_state is not None else {}
    cache = state.setdefault("cache", {}) if isinstance(state, dict) else {}
    key = cache_key(ctx)

    # Same company already looked up this run -> reuse it, spend nothing.
    if key in cache:
        cached = cache[key]
        state["cache_hits"] = state.get("cache_hits", 0) + 1
        if cached:
            ctx = _apply(ctx, cached)
            return finalize_email(ctx, use_pattern=cfg.email_pattern_fallback)
        # Cached miss: this company yielded nothing earlier — don't pay again.
        return finalize_email(ctx, use_pattern=cfg.email_pattern_fallback)

    if (not ctx.get("recruiter_email") and cfg.hunter_api_key and is_lookupable(ctx)
            and hunter_state is not None and not state.get("disabled")
            and state.get("remaining", 0) > 0):
        res = hunter_search(ctx, cfg)
        status = res.get("status")
        if status == "ok":
            state["remaining"] -= 1
            state["used"] = state.get("used", 0) + 1
            ctx = pick_hunter(ctx, res.get("data") or {})
        elif status == "rate_limited":
            state["disabled"] = True
            log.warning("Hunter rate/credit limit hit -> Hunter disabled for the rest of this run")
        # 'error'/'skip' -> just fall through to the next provider

    if not ctx.get("recruiter_email") and cfg.apollo_api_key and not state.get("apollo_disabled"):
        resp = apollo_search(ctx, cfg)
        if resp.get("_stop"):
            state["apollo_disabled"] = True
        else:
            ctx = pick_apollo(ctx, resp)
            if ctx.get("email_source") == "apollo":
                state["apollo_used"] = state.get("apollo_used", 0) + 1

    # Remember this company for the rest of the run (a miss is cached too, so a
    # dead company isn't looked up ten times).
    cache[key] = _harvest(ctx) if ctx.get("recruiter_email") else {}
    if ctx.get("company_domain") and not cache[key]:
        cache[key] = {"company_domain": ctx["company_domain"]}

    return finalize_email(ctx, use_pattern=cfg.email_pattern_fallback)
