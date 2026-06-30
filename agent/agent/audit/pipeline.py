"""Website-audit pipeline — the runnable entry point (python -m agent.audit.pipeline).

Ports the n8n main loop: read pending leads -> fetch site -> enough content? ->
AI section -> build HTML email -> send (gated) -> write status back.

Gated on (audit_settings.send_emails AND Gmail connected): off => every lead is
drafted to status 'dry_run' with its email_html stored, nothing sent.
"""
from __future__ import annotations

import logging
import random
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from ..config import get_config
from .. import google
from ..store import get_gmail_auth
from . import email_writer, scrape, store

log = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def run() -> dict[str, int]:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    cfg = get_config()
    settings = store.get_settings(cfg)

    gmail_ready = google.is_ready(cfg)
    sending = bool(settings.get("send_emails")) and gmail_ready
    cap = int(settings.get("daily_send_cap") or 40)

    leads = store.get_pending_leads(cfg, cap)
    counts: Counter[str] = Counter()
    log.info(
        "audit run: %d pending lead(s), cap=%d, send=%s (settings.send_emails=%s, gmail_ready=%s)",
        len(leads), cap, sending, settings.get("send_emails"), gmail_ready,
    )

    # One-click unsubscribe header (bulk-deliverability requirement): mailto to
    # the sending inbox + the hosted https opt-out. Built once per run.
    send_headers: dict[str, str] | None = None
    if sending:
        sender_addr = str(get_gmail_auth(cfg).get("gmail_address") or settings.get("sender_email") or "").strip()
        unsub_url = str(settings.get("unsubscribe_url") or "").strip()
        parts = []
        if sender_addr:
            parts.append(f"<mailto:{sender_addr}?subject=unsubscribe>")
        if unsub_url:
            parts.append(f"<{unsub_url}>")
        if parts:
            send_headers = {"List-Unsubscribe": ", ".join(parts)}

    for lead in leads:
        email = str(lead.get("email") or "").strip()
        if not email:
            continue

        site = scrape.parse_site(scrape.fetch_site(lead.get("website") or ""))
        if int(site["content_length"]) < scrape.MIN_CONTENT:
            store.update_lead(cfg, email, {
                "status": "skipped",
                "skip_reason": "Website unreachable or too little readable content to personalize.",
                "domain": scrape.domain_of(str(lead.get("website") or "")),
            })
            counts["skipped"] += 1
            log.info("  %s -> skipped (content_length=%s)", email, site["content_length"])
            continue

        ai = email_writer.analyze(cfg, lead, site)
        built = email_writer.build_email(settings, lead, site, ai)

        fields: dict[str, Any] = {
            "subject": built["subject"],
            "ai_business_name": built["ai_business_name"],
            "ai_summary": built["ai_summary"],
            "ai_gaps": built["ai_gaps"],
            "email_html": built["html"],
            "domain": built["domain"],
        }

        if sending:
            try:
                google.send_html_email(cfg, built["to"], built["subject"], built["html"], headers=send_headers)
                fields.update(status="sent", sent_at=_now_iso(), error="")
                counts["sent"] += 1
                log.info("  %s -> sent", email)
            except Exception as exc:  # noqa: BLE001
                fields.update(status="send_error", error=str(exc)[:300])
                counts["send_error"] += 1
                log.warning("  %s -> send_error: %s", email, exc)
            # Human-like spacing: fixed throttle + random jitter (anti-spam).
            jitter = random.uniform(0, cfg.send_throttle_jitter_seconds) if cfg.send_throttle_jitter_seconds > 0 else 0
            delay = cfg.send_throttle_seconds + jitter
            log.info("  …waiting %.0fs before next send", delay)
            time.sleep(delay)
        else:
            fields["status"] = "dry_run"
            counts["dry_run"] += 1
            log.info("  %s -> dry_run (drafted, not sent)", email)

        store.update_lead(cfg, email, fields)

    summary = dict(counts)
    log.info("audit complete -> %s", summary or "nothing pending")
    return summary


if __name__ == "__main__":
    run()
