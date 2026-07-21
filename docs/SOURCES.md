# Lead sources

Discovery merges these sources in `agent/agent/sources.py::fetch_all`. Each keyed
source only runs when its token is present in the environment.

| Source (`source` value) | How it's fetched | Notes |
|---|---|---|
| `linkedin` | Apify actor `cheap_scraper~linkedin-job-scraper` (`APIFY_TOKEN`) | Main source. Remote-only, region-targeted. |
| `jsearch` | JSearch / RapidAPI (`JSEARCH_API_KEY`) | Aggregator over Google-for-Jobs. |
| `glassdoor` | via JSearch (publisher tag) | See below. |
| `monster` | via JSearch (publisher tag) | See below. |
| `indeed`, `ziprecruiter`, `linkedin` (from JSearch) | via JSearch (publisher tag) | Same mechanism. |
| `himalayas` | `himalayas.app/jobs/api` (keyless) | Re-enabled 2026-07-21. |

## GoMaster (= Monster.com) and GlassStore (= Glassdoor)

These were requested as new integrations. Investigated 2026-07-21:

- **Neither exposes a usable public jobs API.** Glassdoor's partner API has been
  closed to new applicants for years; Monster has no open listings API.
- **Both are heavily anti-bot** (Cloudflare, login walls, aggressive rate
  limiting). A direct HTML scraper would need rotating residential proxies +
  headless browsers, break frequently, and violate their ToS — not worth building
  into a cron that must run unattended.
- **They are already aggregated by JSearch** (a Google-for-Jobs wrapper), which
  returns a `job_publisher` field naming the origin board.

**What we did instead (robust, zero new infrastructure):** in
`normalize_jsearch` we read `job_publisher` and map it to the `source` column via
`_publisher_to_source`, so Glassdoor- and Monster-originated listings show up as
`source = "glassdoor"` / `"monster"` and are filterable in the dashboard exactly
like a first-class source. The raw publisher string is also stored in
`applications.publisher`.

### If you later want more Glassdoor/Monster volume
Volume is bounded by whatever JSearch surfaces for those publishers. To go beyond
that, the realistic options (each a follow-up project, opt-in):

1. **SerpApi Google Jobs API** — returns per-result `via`/source and is designed
   for this; add a `fetch_serpapi()` source keyed on a `SERPAPI_KEY`.
2. **Official/partner access** — apply for Glassdoor/Monster partner data feeds
   (approval + likely paid).
3. **Direct scraping** — only with proxies + a headless browser and an accepted
   ToS/maintenance risk. Not recommended for the unattended cron.

Direct scraping is intentionally **not** implemented; the publisher-tagging path
covers the request without a brittle dependency.
