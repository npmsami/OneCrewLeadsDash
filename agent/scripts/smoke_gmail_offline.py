"""Offline checks for agent/google.py — no network, no creds needed.

Verifies MIME assembly, From/timestamp parsing, and the not-ready guard.
Live send/inbox is exercised by smoke_gmail_live.py once creds are set.
"""
import base64
import sys
from datetime import timezone
from email import policy
from email.parser import BytesParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agent import google
from agent.config import get_config


def message_from_bytes(b: bytes):
    return BytesParser(policy=policy.default).parsebytes(b)

# --- build_raw: round-trip a plain-text email with a PDF attachment ---
raw = google.build_raw(
    to="jane@acme.com", subject="Senior SRE - available now",
    body="Hi Jane,\n\nShort note.\n\nMahad", from_addr="me@workspace.com",
    attachment=b"%PDF-1.4 fake", filename="Mahad_Resume.pdf",
)
msg = message_from_bytes(base64.urlsafe_b64decode(raw))
assert msg["To"] == "jane@acme.com", msg["To"]
assert msg["Subject"] == "Senior SRE - available now"
assert msg["From"] == "me@workspace.com"
parts = list(msg.iter_attachments())
assert len(parts) == 1 and parts[0].get_filename() == "Mahad_Resume.pdf"
assert parts[0].get_content_type() == "application/pdf"
body = msg.get_body(preferencelist=("plain",)).get_content()
assert "Short note." in body
print("build_raw: To/Subject/From/body/attachment all correct")

# --- build_raw without attachment is a simple text message ---
raw2 = google.build_raw(to="x@y.com", subject="Re: hi", body="circling back")
msg2 = message_from_bytes(base64.urlsafe_b64decode(raw2))
assert not list(msg2.iter_attachments())
print("build_raw (no attachment): plain text, no parts")

# --- _from_email + _internal_ts: parse a Gmail metadata message ---
sample = {
    "internalDate": "1719700000000",
    "payload": {"headers": [
        {"name": "From", "value": "Jane Doe <Jane@Acme.com>"},
        {"name": "Subject", "value": "Re: your application"},
    ]},
}
assert google._from_email(sample) == "jane@acme.com"
ts = google._internal_ts(sample)
assert ts is not None and ts.tzinfo == timezone.utc
print(f"parse: sender=jane@acme.com ts={ts.isoformat()}")

# Missing/garbage fields degrade to '' / None, never raise.
assert google._from_email({}) == ""
assert google._internal_ts({"internalDate": "nope"}) is None
print("parse: missing/garbage fields handled")

# --- is_ready: creds empty in this env -> False (no crash) ---
ready = google.is_ready(get_config())
print(f"is_ready (creds empty expected) = {ready}")
assert ready is False, "expected not-ready while GOOGLE_CLIENT_ID/SECRET are blank"

print("SMOKE GMAIL OFFLINE CLEAN")
