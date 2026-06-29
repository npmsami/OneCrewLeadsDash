"""Generate sample application emails on REAL on-target jobs for quality review.

Run: .venv/Scripts/python.exe -m scripts.sample_emails
Dry-run only — nothing is stored or sent. Uses the live settings template.
"""
import logging

from agent.config import get_config
from agent.sources import fetch_all
from agent.filters import hard_filters, filter_new
from agent import store
from agent.email_writer import write_email
from agent.followup import write_followup

logging.disable(logging.INFO)
cfg = get_config()
prof = store.get_settings(cfg)

jobs = filter_new(hard_filters(fetch_all(cfg), cfg), existing_rows=[], cfg=cfg)
targets = [j for j in jobs if any(k in j["job_title"].lower()
           for k in ("devops", "sre", "reliability", "platform", "cloud", "infrastructure"))][:3]
if not targets:
    targets = jobs[:3]

# give them a plausible recruiter name + track so samples read realistically
for j in targets:
    j.setdefault("recruiter_name", "Alex")
    j.setdefault("matched_track", "DevOps | Cloud")

for i, j in enumerate(targets, 1):
    r = write_email(j, cfg, prof)
    print("=" * 72)
    print(f"SAMPLE {i}: {j['job_title']} @ {j['company']}  [{j['source']}]")
    print("=" * 72)
    print("Subject:", r["email_subject"])
    print()
    print(r["email_body"])
    print()

# one follow-up sample
if targets:
    j = dict(targets[0]); j["email_subject"] = "Senior DevOps Engineer - available immediately"
    f = write_followup(j, cfg, prof)
    print("=" * 72)
    print(f"FOLLOW-UP SAMPLE: {j['job_title']} @ {j['company']}")
    print("=" * 72)
    print("Subject:", f["fu_subject"])
    print()
    print(f["fu_body"])
