"""Smoke test the LLM scoring layer against a few LIVE jobs.

Run: .venv/Scripts/python.exe -m scripts.smoke_score
Requires LLM_API_KEY in .env. Scores the first N filtered jobs (default 4).
"""
import logging
import sys

from agent.config import get_config
from agent.sources import fetch_all
from agent.filters import hard_filters, filter_new
from agent.score import score_job

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

N = int(sys.argv[1]) if len(sys.argv) > 1 else 4
cfg = get_config()

if not cfg.llm_api_key:
    sys.exit("LLM_API_KEY missing from .env")

jobs = filter_new(hard_filters(fetch_all(), cfg), existing_rows=[], cfg=cfg)[:N]
print(f"\nScoring {len(jobs)} jobs (model={cfg.llm_model}, min_score={cfg.min_score})\n")

for j in jobs:
    r = score_job(j, cfg)
    print(f"[{r['status']:11}] {r.get('match_score')!s:>4}/100  {r['job_title'][:45]:45} @ {r['company'][:22]:22}")
    print(f"             track={r.get('matched_track')!r}  geo={r.get('geo_eligible')}  ({r.get('geo_reason') or r.get('notes') or ''})")
    if r["status"] == "score_error":
        print(f"             ERROR: {r.get('notes')}")
