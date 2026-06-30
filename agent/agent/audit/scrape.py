"""Website fetch + text extraction — ports the n8n "Fetch Website" HTTP node
and the HTML-stripping half of "Prepare Website + Prompt".

fetch_site(url)  -> raw HTML string ("" on any failure)
parse_site(html) -> {"title","meta","text","content_length"}
"""
from __future__ import annotations

import logging
import re

import requests
import urllib3

# Prospect sites often have broken/expired certs; we fetch with verify=False, so
# silence the per-request InsecureRequestWarning noise.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

log = logging.getLogger(__name__)

_TIMEOUT = 20
MIN_CONTENT = 80   # "Has Enough Content?" gate: content_length >= 80
MAX_TEXT = 6000    # websiteText = text.slice(0, 6000)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def normalize_url(raw: str) -> str:
    """Add https:// if the URL has no scheme (mirrors the Fetch Website expression)."""
    s = (raw or "").strip()
    if not s:
        return ""
    return s if s.lower().startswith("http") else "https://" + s


def domain_of(raw: str) -> str:
    """Bare host: strip scheme + www + path."""
    s = re.sub(r"^https?://", "", (raw or "").strip(), flags=re.I)
    s = re.sub(r"^www\.", "", s, flags=re.I)
    return s.split("/")[0]


def _decode(s: str) -> str:
    """Port of the workflow's entity-decode + whitespace-collapse helper."""
    s = s or ""
    s = re.sub(r"&nbsp;", " ", s, flags=re.I)
    s = re.sub(r"&amp;", "&", s, flags=re.I)
    s = re.sub(r"&#39;|&apos;|&lsquo;|&rsquo;", "'", s, flags=re.I)
    s = re.sub(r"&quot;|&ldquo;|&rdquo;", '"', s, flags=re.I)
    s = re.sub(r"&mdash;|&ndash;", "-", s, flags=re.I)
    s = re.sub(r"&[a-z0-9#]+;", " ", s, flags=re.I)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def fetch_site(url: str) -> str:
    """GET the page as text. Returns "" on any error (mirrors onError=continue)."""
    target = normalize_url(url)
    if not target:
        return ""
    try:
        resp = requests.get(target, headers=_HEADERS, timeout=_TIMEOUT, verify=False)
        return resp.text or ""
    except Exception as exc:  # noqa: BLE001
        log.warning("fetch failed for %s: %s", target, exc)
        return ""


def parse_site(html: str) -> dict[str, object]:
    """Extract title, meta description, and cleaned body text from raw HTML."""
    html = html or ""

    title = ""
    m = re.search(r"<title[^>]*>([\s\S]*?)</title>", html, re.I)
    if m:
        title = _decode(m.group(1))

    meta = ""
    m = re.search(
        r"""<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']""", html, re.I
    )
    if m:
        meta = _decode(m.group(1))

    body = html
    body = re.sub(r"<script[\s\S]*?</script>", " ", body, flags=re.I)
    body = re.sub(r"<style[\s\S]*?</style>", " ", body, flags=re.I)
    body = re.sub(r"<noscript[\s\S]*?</noscript>", " ", body, flags=re.I)
    body = re.sub(r"<!--[\s\S]*?-->", " ", body)
    body = re.sub(r"<[^>]+>", " ", body)
    text = _decode(body)[:MAX_TEXT]

    return {"title": title, "meta": meta, "text": text, "content_length": len(text)}
