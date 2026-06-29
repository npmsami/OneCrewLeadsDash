"""Smoke test enrichment. Conserves Hunter quota: domain-extraction is shown for
several jobs (free), but only ONE real Hunter call is made.

Run: .venv/Scripts/python.exe -m scripts.smoke_enrich
"""
import logging

from agent.config import get_config
from agent.sources import fetch_all
from agent.filters import hard_filters, filter_new
from agent import enrich

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
cfg = get_config()

jobs = filter_new(hard_filters(fetch_all(), cfg), existing_rows=[], cfg=cfg)
print(f"\nextract_domain (free, no API) for {len(jobs)} jobs:")
for j in jobs:
    print(f"   {enrich.extract_domain(j) or '(none -> Hunter by company name)':45}  <- {j['job_url'][:60]}")

# ONE real Hunter call through the full chain.
job = dict(jobs[0])
print(f"\nfull enrich() on: {job['job_title'][:40]} @ {job['company']}")
result = enrich.enrich(job, cfg)
for k in ("company_domain", "recruiter_email", "recruiter_name", "email_confidence", "email_source", "email_found", "status"):
    print(f"   {k:16} = {result.get(k)!r}")
