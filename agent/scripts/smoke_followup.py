"""Smoke test the follow-up engine logic (no Supabase writes).

Run: .venv/Scripts/python.exe -m scripts.smoke_followup
Tests select_due across each branch with synthetic rows, then drafts one real
follow-up via the template (1 LLM call).
"""
import logging
from datetime import datetime, timedelta, timezone

from agent.config import get_config
from agent import store
from agent.followup import select_due, write_followup

logging.disable(logging.INFO)
cfg = get_config()
now = datetime.now(tz=timezone.utc)


def iso(days_ago):
    return (now - timedelta(days=days_ago)).isoformat()


rows = [
    {"job_id": "a", "company": "Acme", "job_title": "DevOps Eng", "recruiter_email": "r@acme.com",
     "status": "applied", "followup_sent": False, "applied_at": iso(12)},          # -> followup
    {"job_id": "b", "company": "Beta", "job_title": "SRE", "recruiter_email": "r@beta.com",
     "status": "applied", "followup_sent": False, "applied_at": iso(2)},           # -> skip (too soon)
    {"job_id": "c", "company": "Cloudy", "job_title": "Platform Eng", "recruiter_email": "r@cloudy.com",
     "status": "applied", "followup_sent": False, "applied_at": iso(12)},          # -> replied (inbox)
    {"job_id": "d", "company": "Delta", "job_title": "Cloud Eng", "recruiter_email": "r@delta.com",
     "status": "followed_up", "followup_sent": True, "followup_date": iso(4)},     # -> close
    {"job_id": "e", "company": "Echo", "job_title": "MLOps", "recruiter_email": "r@echo.com",
     "status": "followed_up", "followup_sent": True, "followup_date": iso(1)},     # -> skip (too soon)
    {"job_id": "f", "company": "Foxtrot", "job_title": "DevOps", "recruiter_email": "",
     "status": "applied", "followup_sent": False, "applied_at": iso(20)},          # -> skip (no email)
]
inbox = [{"sender": "r@cloudy.com", "ts": now - timedelta(days=1)}]  # Cloudy replied

due = select_due(rows, inbox, now)
print("select_due results:")
for r, action in due:
    print(f"  {r['job_id']} ({r['company']:8}) -> {action}")
got = {r["job_id"]: a for r, a in due}
expected = {"a": "followup", "c": "replied", "d": "close"}
print(f"\nmatches expected {expected}: {got == expected}")

# One real follow-up draft using the seeded template
prof = store.get_settings(cfg)
job = {"job_title": "Senior Platform Engineer", "company": "Acme Cloud", "recruiter_email": "sarah@acme.com",
       "recruiter_name": "Sarah", "email_subject": "Senior Platform Engineer - available immediately"}
d = write_followup(job, cfg, prof)
print("\n--- FOLLOW-UP DRAFT ---")
print("Subject:", d["fu_subject"])
print(d["fu_body"])
