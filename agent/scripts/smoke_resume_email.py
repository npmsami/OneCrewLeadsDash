"""Smoke test resume tailoring + cold email on one real DevOps job.

Run: .venv/Scripts/python.exe -m scripts.smoke_resume_email
Picks a genuine DevOps/SRE posting, scores it (for matched_track), then renders
the tailored resume and the cold email.
"""
import logging

from agent.config import get_config
from agent.sources import fetch_all
from agent.filters import hard_filters, filter_new
from agent.score import score_job
from agent.resume import tailor_resume
from agent.email_writer import write_email

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
cfg = get_config()

jobs = filter_new(hard_filters(fetch_all(), cfg), existing_rows=[], cfg=cfg)
# Prefer a real DevOps/SRE/Cloud title for a meaningful resume.
pick = next((j for j in jobs if any(k in j["job_title"].lower() for k in ("devops", "sre", "reliability", "cloud", "platform"))), jobs[0])

# html.unescape check
print(f"\nentity check — company: {pick['company']!r}")

print(f"picked: {pick['job_title']} @ {pick['company']}\n")
scored = score_job(pick, cfg)
scored["recruiter_name"] = "Alex"  # simulate an enriched contact for the greeting
print(f"score: {scored.get('match_score')} | track: {scored.get('matched_track')} | status: {scored['status']}\n")

with_resume = tailor_resume(scored, cfg)
print("=" * 70)
print("RESUME (" + with_resume["resume_filename"] + "):")
print("=" * 70)
print(with_resume["resume_text"][:1400])
if with_resume["resume_note"]:
    print("\n[note]", with_resume["resume_note"])

with_email = write_email(with_resume, cfg)
print("\n" + "=" * 70)
print("COLD EMAIL")
print("=" * 70)
print("Subject:", with_email["email_subject"])
print()
print(with_email["email_body"])
if with_email["email_note"]:
    print("\n[note]", with_email["email_note"])
