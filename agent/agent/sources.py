"""Discovery layer — fetch + normalize the 6 free job feeds.

Direct port of the Fetch* HTTP nodes + Normalize* Code nodes from
scripts/build_workflow.js. Every normalizer returns the same dict shape:

    {title, company, url, location_tag, posted_at, description,
     tags(list[str]), salary_raw, company_website, source}

Like the n8n nodes (onError=continueRegularOutput), one dead feed never kills
the run — a failing source logs a warning and contributes zero jobs.
"""
from __future__ import annotations

import html
import logging
from datetime import datetime, timezone
from typing import Any, Callable

import requests

log = logging.getLogger(__name__)

# Text fields that may carry HTML entities (&amp;, &#39;, ...) from the feeds.
# Decoding here improves Hunter lookups, LLM prompts, and email greetings — a
# deliberate improvement over the n8n original, which left entities raw.
_ENTITY_FIELDS = ("title", "company", "location_tag", "description", "salary_raw")


def _decode_entities(jobs: list[dict]) -> list[dict]:
    for j in jobs:
        for f in _ENTITY_FIELDS:
            if isinstance(j.get(f), str):
                j[f] = html.unescape(j[f])
        if isinstance(j.get("tags"), list):
            j["tags"] = [html.unescape(t) if isinstance(t, str) else t for t in j["tags"]]
    return jobs

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) JobAgent/1.0"
_TIMEOUT = 30


def _s(v: Any) -> str:
    """str() coercion that maps None to '' (mirrors String(x || '') in JS)."""
    return "" if v is None else str(v)


def _epoch_to_iso(epoch: Any) -> str:
    try:
        return datetime.fromtimestamp(int(epoch), tz=timezone.utc).isoformat()
    except (ValueError, TypeError, OSError):
        return ""


# ---------------------------------------------------------------------------
# Normalizers (pure: raw decoded response -> list[dict])
# ---------------------------------------------------------------------------
def normalize_remoteok(data: Any) -> list[dict]:
    # RemoteOK: array; first element is a legal notice (no position).
    out = []
    for j in data if isinstance(data, list) else []:
        if not isinstance(j, dict):
            continue
        if not (j.get("position") or j.get("title")) or not j.get("company"):
            continue
        posted = _s(j.get("date")) or (_epoch_to_iso(j["epoch"]) if j.get("epoch") else "")
        out.append({
            "title": _s(j.get("position") or j.get("title")),
            "company": _s(j.get("company")),
            "url": _s(j.get("url") or ("https://remoteok.com" + _s(j.get("apply_url")))),
            "location_tag": _s(j.get("location") or "Remote"),
            "posted_at": posted,
            "description": _s(j.get("description")),
            "tags": j["tags"] if isinstance(j.get("tags"), list) else [],
            "salary_raw": ("$" + _s(j.get("salary_min")) + "-" + _s(j.get("salary_max") or "?")) if j.get("salary_min") else "",
            "company_website": "",
            "source": "remoteok",
        })
    return out


def normalize_remotive(data: Any) -> list[dict]:
    jobs = data.get("jobs", []) if isinstance(data, dict) else []
    return [{
        "title": _s(j.get("title")),
        "company": _s(j.get("company_name")),
        "url": _s(j.get("url")),
        "location_tag": _s(j.get("candidate_required_location") or "Remote"),
        "posted_at": _s(j.get("publication_date")),
        "description": _s(j.get("description")),
        "tags": j["tags"] if isinstance(j.get("tags"), list) else [],
        "salary_raw": _s(j.get("salary")),
        "company_website": "",
        "source": "remotive",
    } for j in jobs if isinstance(j, dict)]


def normalize_arbeitnow(data: Any) -> list[dict]:
    jobs = data.get("data", []) if isinstance(data, dict) else []
    out = []
    for j in jobs:
        if not isinstance(j, dict) or j.get("remote") is not True:
            continue
        out.append({
            "title": _s(j.get("title")),
            "company": _s(j.get("company_name")),
            "url": _s(j.get("url")),
            "location_tag": _s(j.get("location") or "Remote"),
            "posted_at": _epoch_to_iso(j["created_at"]) if j.get("created_at") else "",
            "description": _s(j.get("description")),
            "tags": list(j.get("tags") or []) + list(j.get("job_types") or []),
            "salary_raw": "",
            "company_website": "",
            "source": "arbeitnow",
        })
    return out


def normalize_jobicy(data: Any) -> list[dict]:
    jobs = data.get("jobs", []) if isinstance(data, dict) else []
    out = []
    for j in jobs:
        if not isinstance(j, dict):
            continue
        salary = ""
        if j.get("salaryMin"):
            salary = (_s(j.get("salaryCurrency") or "$") + _s(j["salaryMin"]) + "-"
                      + _s(j.get("salaryMax") or "?") + "/" + _s(j.get("salaryPeriod") or "yr"))
        out.append({
            "title": _s(j.get("jobTitle")),
            "company": _s(j.get("companyName")),
            "url": _s(j.get("url")),
            "location_tag": _s(j.get("jobGeo") or "Remote"),
            "posted_at": _s(j.get("pubDate")).replace(" ", "T"),
            "description": _s(j.get("jobDescription") or j.get("jobExcerpt")),
            "tags": list(j.get("jobIndustry") or []) + list(j.get("jobType") or []),
            "salary_raw": salary,
            "company_website": "",
            "source": "jobicy",
        })
    return out


def normalize_himalayas(data: Any) -> list[dict]:
    jobs = data.get("jobs", []) if isinstance(data, dict) else []
    out = []
    for j in jobs:
        if not isinstance(j, dict):
            continue
        locs = j.get("locationRestrictions")
        location_tag = ", ".join(locs) if isinstance(locs, list) and locs else "Worldwide"
        salary = ""
        if j.get("minSalary"):
            salary = (_s(j.get("currency") or "USD") + " " + _s(j["minSalary"]) + "-"
                      + _s(j.get("maxSalary") or "?") + "/" + _s(j.get("salaryPeriod") or "yr"))
        out.append({
            "title": _s(j.get("title")),
            "company": _s(j.get("companyName")),
            "url": _s(j.get("applicationLink") or j.get("guid")),
            "location_tag": location_tag,
            "posted_at": _epoch_to_iso(j["pubDate"]) if j.get("pubDate") else "",
            "description": _s(j.get("description") or j.get("excerpt")),
            "tags": list(j.get("categories") or []) + list(j.get("seniority") or []),
            "salary_raw": salary,
            "company_website": "",
            "source": "himalayas",
        })
    return out


def normalize_jsearch(data: Any) -> list[dict]:
    # JSearch (RapidAPI) aggregates LinkedIn/Indeed/Glassdoor/ZipRecruiter etc.
    # Unlike the keyless feeds it exposes employer_website -> a real company domain.
    jobs = data.get("data", []) if isinstance(data, dict) else []
    out = []
    for j in jobs:
        if not isinstance(j, dict):
            continue
        country = _s(j.get("job_country"))
        if j.get("job_is_remote"):
            location = "Remote" + (", " + country if country else "")
        else:
            parts = [p for p in (_s(j.get("job_city")), _s(j.get("job_state")), country) if p]
            location = ", ".join(parts) or "Remote"
        salary = ""
        if j.get("job_min_salary"):
            cur = _s(j.get("job_salary_currency") or "$")
            per = _s(j.get("job_salary_period") or "yr")
            salary = f"{cur}{j.get('job_min_salary')}-{j.get('job_max_salary') or '?'}/{per}"
        tags = []
        if j.get("job_employment_type"):
            tags.append(_s(j.get("job_employment_type")))
        if isinstance(j.get("job_required_skills"), list):
            tags += [str(t) for t in j["job_required_skills"]]
        out.append({
            "title": _s(j.get("job_title")),
            "company": _s(j.get("employer_name")),
            "url": _s(j.get("job_apply_link") or j.get("job_google_link")),
            "location_tag": location,
            "posted_at": _s(j.get("job_posted_at_datetime_utc")),
            "description": _s(j.get("job_description")),
            "tags": tags,
            "salary_raw": salary,
            "company_website": _s(j.get("employer_website")),
            "source": "jsearch",
        })
    return out


def normalize_wwr(entries: Any) -> list[dict]:
    # We Work Remotely RSS items: title is 'Company: Role'.
    out = []
    for e in entries or []:
        raw_title = _s(e.get("title"))
        link = e.get("link")
        if not raw_title or not link:
            continue
        idx = raw_title.find(":")
        company = raw_title[:idx].strip() if idx > 0 else "Unknown"
        title = raw_title[idx + 1:].strip() if idx > 0 else raw_title.strip()
        desc = e.get("content") or e.get("summary") or ""
        if isinstance(desc, list) and desc:
            desc = desc[0].get("value", "")
        out.append({
            "title": title,
            "company": company,
            "url": _s(link),
            "location_tag": "Remote",
            "posted_at": _s(e.get("published") or e.get("updated")),
            "description": _s(desc),
            "tags": [],
            "salary_raw": "",
            "company_website": "",
            "source": "weworkremotely",
        })
    return out


# ---------------------------------------------------------------------------
# Fetchers — each returns normalized jobs; failures degrade to [] (onError=continue)
# ---------------------------------------------------------------------------
def _get_json(url: str, headers: dict | None = None, params: dict | None = None) -> Any:
    resp = requests.get(url, headers=headers, params=params, timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def _safe(name: str, fn: Callable[[], list[dict]]) -> list[dict]:
    try:
        jobs = fn()
        log.info("source %-13s -> %d jobs", name, len(jobs))
        return jobs
    except Exception as exc:  # noqa: BLE001 — one dead feed must not kill the run
        log.warning("source %-13s failed: %s", name, exc)
        return []


def fetch_remoteok() -> list[dict]:
    return normalize_remoteok(_get_json("https://remoteok.com/api", {"User-Agent": _UA}))


def fetch_remotive() -> list[dict]:
    return normalize_remotive(_get_json("https://remotive.com/api/remote-jobs?category=software-dev&limit=100"))


def fetch_arbeitnow() -> list[dict]:
    return normalize_arbeitnow(_get_json("https://www.arbeitnow.com/api/job-board-api"))


def fetch_jobicy() -> list[dict]:
    return normalize_jobicy(_get_json("https://jobicy.com/api/v2/remote-jobs?count=50&tag=devops"))


def fetch_himalayas() -> list[dict]:
    return normalize_himalayas(_get_json("https://himalayas.app/jobs/api?limit=100"))


def fetch_wwr() -> list[dict]:
    import feedparser

    feed = feedparser.parse("https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss")
    return normalize_wwr(feed.entries)


def fetch_jsearch(cfg) -> list[dict]:
    if not getattr(cfg, "jsearch_api_key", ""):
        return []
    headers = {"X-RapidAPI-Key": cfg.jsearch_api_key, "X-RapidAPI-Host": "jsearch.p.rapidapi.com"}
    date_posted = "week" if cfg.lookback_hours <= 168 else "month"
    params = {
        "query": cfg.jsearch_query,
        "page": "1",
        "num_pages": str(cfg.jsearch_num_pages),
        "date_posted": date_posted,
        "remote_jobs_only": "true",
    }
    return normalize_jsearch(_get_json("https://jsearch.p.rapidapi.com/search", headers, params))


def fetch_all(cfg=None) -> list[dict]:
    """Merge Sources: every feed concatenated into one list.

    Keyless feeds always run; JSearch runs only when cfg carries a RapidAPI key.
    """
    merged: list[dict] = []
    merged += _safe("remoteok", fetch_remoteok)
    merged += _safe("remotive", fetch_remotive)
    merged += _safe("arbeitnow", fetch_arbeitnow)
    merged += _safe("jobicy", fetch_jobicy)
    merged += _safe("himalayas", fetch_himalayas)
    merged += _safe("weworkremotely", fetch_wwr)
    if cfg is not None:
        merged += _safe("jsearch", lambda: fetch_jsearch(cfg))
    return _decode_entities(merged)
