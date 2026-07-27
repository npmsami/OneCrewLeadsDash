"""Follow-up engine: the 24h draft gate. This engine must NEVER send."""
from datetime import datetime, timedelta, timezone

import agent.followup as followup


NOW = datetime(2026, 7, 28, 12, 0, tzinfo=timezone.utc)


def _row(**over):
    row = {
        "job_id": "j1", "recruiter_email": "jane@acme.com", "status": "applied",
        "applied_at": (NOW - timedelta(hours=30)).isoformat(),
        "followup_sent": False, "followup_body": None,
    }
    row.update(over)
    return row


def _sent(hours_ago=30, job_id="j1"):
    return {job_id: (NOW - timedelta(hours=hours_ago)).isoformat()}


def test_drafts_after_24h_without_a_reply():
    due = followup.select_due([_row()], [], NOW, _sent())
    assert due == [(due[0][0], "draft_followup")]


def test_does_not_draft_before_24h():
    assert followup.select_due([_row()], [], NOW, _sent(hours_ago=5)) == []


def test_requires_an_email_to_have_actually_been_sent():
    """applied_at alone is not proof: the manual "Mark applied" button stamps it
    too, and those leads were never emailed."""
    assert followup.select_due([_row()], [], NOW, {}) == []


def test_does_not_redraft_when_a_draft_already_exists():
    """The stored draft is the user's to edit — regenerating would clobber edits."""
    assert followup.select_due([_row(followup_body="Circling back...")], [], NOW, _sent()) == []


def test_a_reply_wins_over_the_draft_gate():
    inbox = [{"sender": "jane@acme.com", "ts": NOW - timedelta(hours=1)}]
    due = followup.select_due([_row()], inbox, NOW, _sent())
    assert due[0][1] == "replied"


def test_skips_rows_without_a_recruiter_email():
    assert followup.select_due([_row(recruiter_email="")], [], NOW, _sent()) == []


def test_closes_a_followed_up_lead_after_the_close_window():
    row = _row(status="followed_up",
               followup_date=(NOW - timedelta(days=followup.CLOSE_AFTER_DAYS + 1)).isoformat())
    assert followup.select_due([row], [], NOW, {})[0][1] == "close"


def test_engine_has_no_send_path_at_all():
    """Regression guard: follow-ups are human-gated. If a send helper ever
    reappears here, the 24h dashboard gate can be bypassed silently."""
    assert not hasattr(followup, "_send_followup")
    src = open(followup.__file__, encoding="utf-8").read()
    assert "google.send_email" not in src


def test_store_followup_draft_does_not_mark_it_sent(monkeypatch):
    """followup_sent/status mean 'a follow-up actually went out' — only the
    outreach worker may set them."""
    written = {}
    monkeypatch.setattr(followup.store, "upsert", lambda cfg, row: written.update(row))
    followup._store_followup_draft(
        None, {"job_id": "j1"}, {"fu_subject": "Re: X", "fu_body": "hi", "fu_note": ""}, NOW.isoformat())
    assert written["followup_subject"] == "Re: X"
    assert written["followup_body"] == "hi"
    assert "followup_sent" not in written
    assert "status" not in written
