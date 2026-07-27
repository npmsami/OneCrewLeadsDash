"""Outreach queue worker — sends ONE due email per tick.

Human-gated flow: the dashboard enqueues a reviewed/edited email into
`outreach_queue` (status=queued) with a randomized `scheduled_at` — either an
initial application ("Apply") or a follow-up ("Send follow-up", kind=followup). This
worker, run on a ~5-min GitHub Actions cron, picks the single oldest due item,
sends it, and marks it. The ~8-10 min gap between sends is baked into
`scheduled_at` at enqueue time; sending at most one per tick keeps the cadence
spaced even though the cron fires more often.

Safety properties:
- **No double-send:** `store.claim_queue_item` does a guarded queued->sending
  update, so only one worker can win a row even if two runs overlap or a job is
  retried.
- **Idempotent:** an item that already carries a `provider_message_id` is
  reconciled as sent, never re-sent.
- **Provider limit:** stops once `settings.daily_send_cap` is reached today.
- **Gated:** only sends when `settings.send_emails` is true AND Gmail is ready;
  otherwise items stay queued (nothing goes out).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from .config import Config, get_config
from . import store, google

log = logging.getLogger(__name__)


def process_due(cfg: Config | None = None) -> dict:
    cfg = cfg or get_config()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    now = datetime.now(tz=timezone.utc)

    profile = store.get_settings(cfg)
    if not profile.get("send_emails"):
        log.info("send_emails=false -> holding queue (nothing sent)")
        return {"sent": 0, "skipped": "send_disabled"}
    if not google.is_ready(cfg):
        log.info("Gmail not ready -> holding queue")
        return {"sent": 0, "skipped": "gmail_not_ready"}

    cap = int(profile.get("daily_send_cap") or cfg.outreach_daily_cap)
    day_iso = now.date().isoformat()
    sent_today = store.count_sent_today(cfg, day_iso)
    if sent_today >= cap:
        log.info("daily send cap reached (%d/%d) -> holding", sent_today, cap)
        return {"sent": 0, "skipped": "daily_cap"}

    item = store.get_due_queue_item(cfg, now.isoformat())
    if not item:
        log.info("no due queue items")
        return {"sent": 0}

    kind = str(item.get("kind") or "initial")

    # Idempotency: already sent (message id present) -> reconcile, don't re-send.
    if item.get("provider_message_id"):
        store.mark_queue_sent(cfg, item["id"], item["job_id"], str(item["provider_message_id"]),
                              now.isoformat(), kind=kind)
        log.info("item %s already had a message id -> reconciled", item["id"])
        return {"sent": 0, "reconciled": item["id"]}

    # Optimistic lock: queued -> sending. Loser of a race gets None.
    claimed = store.claim_queue_item(cfg, item["id"], int(item.get("attempts") or 0))
    if not claimed:
        log.info("item %s claimed by another run -> skip", item["id"])
        return {"sent": 0, "skipped": "lost_race"}

    # Resolve resume attachment: explicit choice -> account default -> none.
    # Follow-ups never re-attach the resume; it went with the first email.
    resume_id = None if kind == "followup" else (item.get("resume_id") or profile.get("default_resume_id"))
    data = fname = mime = None
    if resume_id:
        data, fname, mime = store.download_resume_by_id(cfg, str(resume_id))

    to = str(item.get("to_email") or "")
    try:
        mid = google.send_email(
            cfg, to=to, subject=str(item.get("subject") or ""), body=str(item.get("body") or ""),
            attachment=data, filename=fname or "Resume.pdf", attachment_mime=mime or "application/pdf",
        )
    except Exception as exc:  # noqa: BLE001 — parked as failed (retryable), not lost
        store.mark_queue_failed(cfg, item["id"], item["job_id"], str(exc))
        log.warning("send failed for %s -> failed: %s", item["job_id"], exc)
        return {"sent": 0, "failed": item["id"]}

    store.mark_queue_sent(cfg, item["id"], item["job_id"], mid,
                          datetime.now(tz=timezone.utc).isoformat(), kind=kind)
    log.info("sent %s %s to %s (msg %s)", kind, item["job_id"], to, mid)
    return {"sent": 1, "kind": kind, "job_id": item["job_id"], "message_id": mid}


if __name__ == "__main__":
    process_due()
