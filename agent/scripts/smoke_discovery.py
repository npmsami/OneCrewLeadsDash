"""Smoke test the discovery + filter layer against the LIVE free feeds.

Run: .venv/Scripts/python.exe -m scripts.smoke_discovery
Proves the Python port pulls real jobs and the hard filters behave.
No secrets required.
"""
import logging
from collections import Counter

from agent.config import get_config
from agent.sources import fetch_all
from agent.filters import hard_filters, filter_new

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

cfg = get_config()
print(f"\nLOOKBACK_HOURS={cfg.lookback_hours}  MIN_SCORE={cfg.min_score}  MAX_JOBS_PER_RUN={cfg.max_jobs_per_run}\n")

raw = fetch_all()
print(f"\nRAW merged jobs: {len(raw)}")
print("by source:", dict(Counter(j["source"] for j in raw)))

filtered = hard_filters(raw, cfg)
print(f"\nAfter hard_filters: {len(filtered)}")
print("by source:", dict(Counter(j["source"] for j in filtered)))

# Simulate an empty store (nothing applied yet) -> filter_new just caps + dedups.
capped = filter_new(filtered, existing_rows=[], cfg=cfg)
print(f"\nAfter filter_new (cap={cfg.max_jobs_per_run}): {len(capped)}\n")

for j in capped:
    print(f"  [{j['source']:13}] {j['job_title'][:55]:55}  @ {j['company'][:25]:25}  {j['posted_date'][:10]}")
    print(f"               id={j['job_id']}  loc={j['location_tag'][:40]}")

# Determinism check: the job_id hash must be stable across calls.
if filtered:
    again = hard_filters(raw, cfg)
    same = filtered[0]["job_id"] == again[0]["job_id"]
    print(f"\njob_id deterministic across runs: {same}")
