"""Round-trip one real scored job through Supabase, then clean up.

Run: .venv/Scripts/python.exe -m scripts.smoke_store
Verifies: get_existing_rows, upsert (log-new + save-score), read-back, delete.
Leaves the table as it found it (no seeded rows).
"""
import logging
import sys

from agent.config import get_config
from agent.sources import fetch_all
from agent.filters import hard_filters, filter_new
from agent.score import score_job
from agent import store

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
cfg = get_config()

before = store.get_existing_rows(cfg)
print(f"\nexisting rows in table: {len(before)}")

jobs = filter_new(hard_filters(fetch_all(), cfg), existing_rows=before, cfg=cfg)
if not jobs:
    sys.exit("no fresh jobs to test with")
job = jobs[0]

# Stage: Log New Jobs (discovery fields, status=new)
log_row = {**{k: job[k] for k in ("job_id", "job_title", "company", "source", "job_url", "posted_date", "scraped_at")}, "status": "new"}
store.upsert(cfg, log_row)
print(f"\nlogged new: {job['job_id']}  {job['job_title'][:40]} @ {job['company'][:25]}")

# Stage: Score + Save Score (upsert score fields onto same row)
scored = score_job(job, cfg)
store.upsert(cfg, scored)
print(f"saved score: status={scored['status']} match_score={scored.get('match_score')} geo={scored.get('geo_eligible')}")

# Read back
row = store.get_client(cfg).table(store.TABLE).select("*").eq("job_id", job["job_id"]).single().execute().data
print("\nread back from Supabase:")
for k in ("job_id", "job_title", "company", "status", "match_score", "geo_eligible", "matched_track", "matched_keywords", "created_at", "updated_at"):
    print(f"   {k:18} = {row.get(k)!r}")
print(f"   updated_at > created_at (trigger fired on save_score): {row['updated_at'] > row['created_at']}")

# Cleanup — don't leave a test row behind
store.delete_job(cfg, job["job_id"])
after = store.get_existing_rows(cfg)
print(f"\ncleaned up. rows now: {len(after)} (was {len(before)})")
