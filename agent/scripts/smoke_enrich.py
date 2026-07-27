"""Smoke test enrichment (Hunter removed). Shows domain-extraction for the
discovered jobs, then runs the full enrich() chain on the first one.

Discovery is JSearch + Apify only, so this needs APIFY_TOKEN / JSEARCH_API_KEY
in the env to return any jobs.

Run: .venv/Scripts/python.exe -m scripts.smoke_enrich
"""
import logging

from agent.config import get_config
from agent.sources import fetch_all
from agent.filters import hard_filters, filter_new
from agent import enrich

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
cfg = get_config()

jobs = filter_new(hard_filters(fetch_all(cfg), cfg), existing_rows=[], cfg=cfg)
if not jobs:
    print("no jobs discovered — set APIFY_TOKEN / JSEARCH_API_KEY in .env and retry")
    raise SystemExit(0)

print(f"\nextract_domain (free, no API) for {len(jobs)} jobs:")
for j in jobs:
    print(f"   {enrich.extract_domain(j) or '(none)':45}  <- {j['job_url'][:60]}")

# Full enrich() chain (Hunter, then optional careers@ pattern) on the first job.
job = dict(jobs[0])
print(f"\nfull enrich() on: {job['job_title'][:40]} @ {job['company']}")
result = enrich.enrich(job, cfg)
for k in ("company_domain", "recruiter_email", "recruiter_name", "email_confidence", "email_source", "email_found", "status"):
    print(f"   {k:16} = {result.get(k)!r}")
