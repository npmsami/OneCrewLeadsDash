"""Live Gmail check — run AFTER setting GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
in .env (same web-client creds the dashboard uses) and connecting Gmail on the
dashboard so gmail_auth.refresh_token is populated.

  python scripts/smoke_gmail_live.py          # read-only: token + inbox
  python scripts/smoke_gmail_live.py --send    # also sends ONE test email to yourself

The --send test emails the connected Gmail address itself and attaches the
resume from the bucket if one is uploaded. Nothing else is touched.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agent import google, store
from agent.config import get_config

cfg = get_config()

if not google.is_ready(cfg):
    print("NOT READY: need GOOGLE_CLIENT_ID/SECRET in .env and a connected Gmail "
          "(gmail_auth.refresh_token). Set those, then re-run.")
    sys.exit(1)

token, address = google.access_token(cfg)
print(f"access token OK (len {len(token)}), connected as: {address}")

inbox = google.fetch_inbox(cfg, newer_than_days=30)
print(f"inbox: {len(inbox)} messages in last 30d")
for m in inbox[:5]:
    print(f"  {m['ts'].isoformat()}  {m['sender']}")

resume, fname = store.download_resume(cfg)
print(f"resume in bucket: {'yes, ' + fname + f' ({len(resume)} bytes)' if resume else 'none uploaded'}")

if "--send" in sys.argv:
    to = address or cfg.candidate_email
    mid = google.send_email(
        cfg, to=to, subject="[test] OneCrew agent Gmail layer",
        body="This is a one-off test from the agent's Gmail layer. Safe to ignore.",
        attachment=resume, filename=fname or "Resume.pdf",
    )
    print(f"SENT test email to {to} (message id {mid})")
else:
    print("(read-only; pass --send to send one test email to yourself)")

print("SMOKE GMAIL LIVE DONE")
