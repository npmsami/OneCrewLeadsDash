"""Outreach queue worker: gating, one-per-tick sending, no-double-send, retries."""
import agent.outreach as outreach
from agent.config import Config


def _cfg():
    cfg = Config()
    object.__setattr__(cfg, "outreach_daily_cap", 40)
    return cfg


def _ready(monkeypatch, cap=40, sent_today=0):
    monkeypatch.setattr(outreach.store, "get_settings",
                        lambda c: {"send_emails": True, "daily_send_cap": cap, "default_resume_id": None})
    monkeypatch.setattr(outreach.google, "is_ready", lambda c: True)
    monkeypatch.setattr(outreach.store, "count_sent_today", lambda c, d: sent_today)
    monkeypatch.setattr(outreach.store, "download_resume_by_id", lambda c, r: (None, None, None))


def test_holds_when_send_disabled(monkeypatch):
    monkeypatch.setattr(outreach.store, "get_settings", lambda c: {"send_emails": False})
    assert outreach.process_due(_cfg())["skipped"] == "send_disabled"


def test_holds_when_gmail_not_ready(monkeypatch):
    monkeypatch.setattr(outreach.store, "get_settings", lambda c: {"send_emails": True, "daily_send_cap": 40})
    monkeypatch.setattr(outreach.google, "is_ready", lambda c: False)
    assert outreach.process_due(_cfg())["skipped"] == "gmail_not_ready"


def test_holds_at_daily_cap(monkeypatch):
    _ready(monkeypatch, cap=2, sent_today=2)
    assert outreach.process_due(_cfg())["skipped"] == "daily_cap"


def test_no_due_item(monkeypatch):
    _ready(monkeypatch)
    monkeypatch.setattr(outreach.store, "get_due_queue_item", lambda c, n: None)
    res = outreach.process_due(_cfg())
    assert res["sent"] == 0 and "skipped" not in res


def test_happy_path_sends_one(monkeypatch):
    _ready(monkeypatch)
    item = {"id": "q1", "job_id": "j1", "to_email": "a@b.com", "subject": "S", "body": "B",
            "attempts": 0, "resume_id": None, "provider_message_id": None}
    monkeypatch.setattr(outreach.store, "get_due_queue_item", lambda c, n: dict(item))
    monkeypatch.setattr(outreach.store, "claim_queue_item", lambda c, i, a: dict(item))
    monkeypatch.setattr(outreach.google, "send_email", lambda *a, **k: "MID123")
    marked = {}
    monkeypatch.setattr(outreach.store, "mark_queue_sent",
                        lambda c, i, j, m, t: marked.update({"id": i, "mid": m}))
    res = outreach.process_due(_cfg())
    assert res["sent"] == 1 and res["message_id"] == "MID123"
    assert marked == {"id": "q1", "mid": "MID123"}


def test_lost_race_does_not_send(monkeypatch):
    _ready(monkeypatch)
    item = {"id": "q1", "job_id": "j1", "to_email": "a@b.com", "attempts": 0, "provider_message_id": None}
    monkeypatch.setattr(outreach.store, "get_due_queue_item", lambda c, n: dict(item))
    monkeypatch.setattr(outreach.store, "claim_queue_item", lambda c, i, a: None)  # another worker won
    sent = {"called": False}
    monkeypatch.setattr(outreach.google, "send_email", lambda *a, **k: sent.__setitem__("called", True) or "X")
    res = outreach.process_due(_cfg())
    assert res["skipped"] == "lost_race"
    assert sent["called"] is False   # no double-send


def test_idempotent_reconcile_never_resends(monkeypatch):
    _ready(monkeypatch)
    item = {"id": "q1", "job_id": "j1", "to_email": "a@b.com", "provider_message_id": "OLD", "attempts": 0}
    monkeypatch.setattr(outreach.store, "get_due_queue_item", lambda c, n: dict(item))
    sent = {"called": False}
    monkeypatch.setattr(outreach.google, "send_email", lambda *a, **k: sent.__setitem__("called", True) or "X")
    monkeypatch.setattr(outreach.store, "mark_queue_sent", lambda *a, **k: None)
    res = outreach.process_due(_cfg())
    assert "reconciled" in res
    assert sent["called"] is False   # already sent -> never re-sent


def test_send_failure_marks_failed(monkeypatch):
    _ready(monkeypatch)
    item = {"id": "q1", "job_id": "j1", "to_email": "a@b.com", "subject": "s", "body": "b",
            "attempts": 0, "resume_id": None, "provider_message_id": None}
    monkeypatch.setattr(outreach.store, "get_due_queue_item", lambda c, n: dict(item))
    monkeypatch.setattr(outreach.store, "claim_queue_item", lambda c, i, a: dict(item))

    def boom(*a, **k):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(outreach.google, "send_email", boom)
    failed = {}
    monkeypatch.setattr(outreach.store, "mark_queue_failed", lambda c, i, j, e: failed.update({"id": i, "err": e}))
    res = outreach.process_due(_cfg())
    assert res["failed"] == "q1"
    assert "smtp down" in failed["err"]
