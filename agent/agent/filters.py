"""Hard filters + dedup — port of CODE.hardFilters and CODE.filterNew.

Drops non-target roles, junior/onsite, obvious geo locks, stale posts and
excluded companies; assigns the stable `job_id` hash and dedupes within the
batch (hard_filters) and against rows already stored (filter_new).
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from dateutil import parser as dateparser

from .config import Config

# --- regexes (verbatim from the n8n Hard Filters node) ---
INCLUDE = re.compile(
    r"(dev\s*ops|dev\s*sec\s*ops|site reliability|\bsre\b|platform engineer|infrastructure engineer|"
    r"cloud (engineer|architect|security|infrastructure|platform)|aws (engineer|architect|devops)|"
    r"azure (engineer|architect|devops)|gcp engineer|appsec|application security|mlops|ml\s*ops|llmops|"
    r"llm\s*ops|dataops|data\s*ops|data (platform|infrastructure) engineer|"
    r"ai (engineer|automation|infrastructure|platform)|genai|gen\s*ai|ml (infrastructure|platform) engineer|"
    r"machine learning (infrastructure|platform)|kubernetes engineer|cloud devops)",
    re.I,
)
EXCLUDE_TITLE = re.compile(
    r"(intern(ship)?\b|junior|\bjr\.?\b|entry[\s-]?level|graduate|trainee|working student|associate degree)",
    re.I,
)
ONSITE = re.compile(r"(on[\s-]?site|in[\s-]?office|hybrid)", re.I)
GEO_REJECT = re.compile(
    r"(\bus[- ]only\b|usa only|united states only|u\.s\. only|us citizens?|green card|security clearance|"
    r"must (be |reside |live )?(based |located )?in (the )?(us|usa|u\.s|uk|eu|europe|canada|australia|germany|netherlands)\b|"
    r"(us|uk|eu) work authoriz|authorized to work in (the )?(us|u\.s|uk|eu)|right to work in (the )?(us|uk|eu)|"
    r"eu (residents?|citizens?) only|north america only|americas only|"
    r"(eastern|pacific|central|mountain) time ?zone (required|only))",
    re.I,
)
COUNTRY_LOCK = re.compile(
    r"(\busa?\b|united states|u\.s\.|\buk\b|united kingdom|\beu\b|europe|canada|australia|germany|france|"
    r"netherlands|poland|spain|portugal|latam|south america|north america|americas|brazil|mexico|japan|korea)",
    re.I,
)
ELIGIBLE = re.compile(
    r"(worldwide|anywhere|global|international|remote|pakistan|asia|apac|emea|mena|middle east)", re.I
)
EXCLUDED_COMPANIES = re.compile(r"netsol", re.I)

_TAG_STRIP = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")


def fnv1a(s: str) -> str:
    """32-bit FNV-1a over UTF-16 code units (matches JS String.charCodeAt)."""
    h = 0x811C9DC5
    for ch in s:
        for cu in _utf16_units(ch):
            h ^= cu
            h = (h * 0x01000193) & 0xFFFFFFFF
    return format(h, "08x")


def _utf16_units(ch: str):
    code = ord(ch)
    if code > 0xFFFF:  # astral plane -> surrogate pair, as JS sees it
        code -= 0x10000
        yield 0xD800 + (code >> 10)
        yield 0xDC00 + (code & 0x3FF)
    else:
        yield code


def make_job_id(title: str, company: str, url_norm: str) -> str:
    key = (title + "|" + company).lower()
    return "j" + fnv1a(key + "|" + url_norm) + fnv1a(url_norm)


def _parse_ms(posted_at: str):
    """Date.parse equivalent -> epoch ms, or None if unparseable."""
    s = (posted_at or "").replace(" ", "T")
    if not s:
        return None
    try:
        dt = dateparser.parse(s)
    except (ValueError, OverflowError, TypeError):
        return None
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def hard_filters(jobs: list[dict], cfg: Config) -> list[dict]:
    """Stage 1 filters + stage 2 hash + in-batch dedup. Sorted newest-first."""
    lookback_ms = max(cfg.lookback_hours, 0) * 3600 * 1000
    now_ms = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    seen: set[str] = set()
    out: list[dict] = []

    for j in jobs:
        title = str(j.get("title") or "").strip()
        company = str(j.get("company") or "").strip()
        url = str(j.get("url") or "").strip()
        if not title or not company or not url:
            continue
        loc = str(j.get("location_tag") or "").strip()
        desc = _WS.sub(" ", _TAG_STRIP.sub(" ", str(j.get("description") or ""))).strip()
        tags = " ".join(j["tags"]) if isinstance(j.get("tags"), list) else str(j.get("tags") or "")

        if EXCLUDED_COMPANIES.search(company):
            continue
        if not INCLUDE.search(title) and not INCLUDE.search(tags):
            continue
        if EXCLUDE_TITLE.search(title):
            continue
        if ONSITE.search(title) or ONSITE.search(loc):
            continue
        if COUNTRY_LOCK.search(loc) and not ELIGIBLE.search(loc):
            continue
        if GEO_REJECT.search(loc) or GEO_REJECT.search(desc[:4000]):
            continue

        posted_ms = _parse_ms(j.get("posted_at", ""))
        if posted_ms is not None and now_ms - posted_ms > lookback_ms:
            continue

        url_norm = re.sub(r"/+$", "", url.lower().split("?")[0])
        key = (title + "|" + company).lower()
        job_id = make_job_id(title, company, url_norm)
        if key in seen or job_id in seen:
            continue
        seen.add(key)
        seen.add(job_id)

        posted_iso = ""
        if posted_ms is not None:
            posted_iso = datetime.fromtimestamp(posted_ms / 1000, tz=timezone.utc).isoformat()

        out.append({
            "job_id": job_id,
            "job_title": title,
            "company": company,
            "job_url": url,
            "source": str(j.get("source") or "unknown"),
            "publisher": j.get("publisher"),
            "location_tag": loc or "Remote",
            "posted_date": posted_iso,
            "scraped_at": datetime.now(tz=timezone.utc).isoformat(),
            "description": desc[:12000],
            "salary_raw": str(j.get("salary_raw") or ""),
            "company_website": str(j.get("company_website") or ""),
        })

    out.sort(key=lambda x: str(x["posted_date"]), reverse=True)
    return out


def filter_new(fresh: list[dict], existing_rows: list[dict], cfg: Config) -> list[dict]:
    """Stage 2: drop jobs already stored (by job_id and by title+company), cap per run."""
    cap = max(1, cfg.max_jobs_per_run)
    existing_ids = {str(r["job_id"]) for r in existing_rows if r.get("job_id")}
    existing_pairs = {
        (str(r["job_title"]) + "|" + str(r["company"])).lower()
        for r in existing_rows if r.get("job_title") and r.get("company")
    }
    kept = [
        j for j in fresh
        if str(j["job_id"]) not in existing_ids
        and (str(j["job_title"]) + "|" + str(j["company"])).lower() not in existing_pairs
    ]
    return kept[:cap]
