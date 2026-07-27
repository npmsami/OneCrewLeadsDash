"""Re-enrich worker: greeting re-addressing and backlog budget behaviour."""
import agent.reenrich as reenrich
from agent.config import Config


def _cfg(**overrides):
    cfg = Config()
    for k, v in overrides.items():
        object.__setattr__(cfg, k, v)
    return cfg


# ---------------------------------------------------------------------------
# readdress — the fallback for drafts written before JDs were persisted
# ---------------------------------------------------------------------------
def test_readdress_replaces_generic_greeting():
    body = "Hi Hiring Team,\n\nSaw the DevOps opening at Acme.\n\nMahad"
    out = reenrich.readdress(body, "Soledad Azorin")
    assert out.startswith("Hi Soledad,")
    assert "Saw the DevOps opening" in out       # rest of the grounded draft intact


def test_readdress_handles_other_greeting_forms():
    assert reenrich.readdress("Hello there,\n\nBody", "Jane Doe").startswith("Hi Jane,")
    assert reenrich.readdress("Dear Hiring Manager,\n\nBody", "Jane Doe").startswith("Hi Jane,")


def test_readdress_prepends_when_no_greeting():
    out = reenrich.readdress("Saw your posting.", "Jane Doe")
    assert out == "Hi Jane,\n\nSaw your posting."


def test_readdress_without_a_name_stays_generic():
    assert reenrich.readdress("Hi Hiring Team,\n\nBody", "").startswith("Hi Hiring Team,")


def test_readdress_does_not_eat_the_body_on_multiline():
    body = "Hi Hiring Team,\n\nLine1\nLine2, with a comma\n\nMahad"
    out = reenrich.readdress(body, "Max Rowse")
    assert "Line2, with a comma" in out
    assert out.count("Hi ") == 1


# ---------------------------------------------------------------------------
# run() guards
# ---------------------------------------------------------------------------
def test_run_noops_without_a_hunter_key():
    out = reenrich.run(_cfg(hunter_api_key=""))
    assert out == {"enriched": 0, "skipped": "no_provider"}


def test_run_holds_when_allowance_is_spent(monkeypatch):
    cfg = _cfg(hunter_api_key="KEY", hunter_daily_cap=5)
    monkeypatch.setattr(reenrich.store, "get_settings", lambda c: {})
    monkeypatch.setattr(reenrich.store, "hunter_remaining", lambda c, d, m: 0)   # fully spent
    out = reenrich.run(cfg)
    assert out == {"enriched": 0, "skipped": "daily_cap"}


def test_run_skips_reposter_rows_without_spending_budget(monkeypatch):
    cfg = _cfg(hunter_api_key="KEY", hunter_daily_cap=5)
    writes = []
    monkeypatch.setattr(reenrich.store, "get_settings", lambda c: {})
    monkeypatch.setattr(reenrich.store, "hunter_remaining", lambda c, d, m: 5)
    monkeypatch.setattr(reenrich.store, "get_enrich_backlog",
                        lambda c, limit: [{"job_id": "1", "company": "JobHub", "job_url": ""}])
    monkeypatch.setattr(reenrich.store, "upsert", lambda c, row: writes.append(row))
    monkeypatch.setattr(reenrich, "enrich", lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not enrich")))
    out = reenrich.run(cfg)
    assert out["not_lookupable"] == 1
    assert out["hunter_searches"] == 0
    assert "reposter" in writes[0]["notes"]


def test_run_promotes_found_lead_to_dry_run(monkeypatch):
    cfg = _cfg(hunter_api_key="KEY", hunter_daily_cap=5)
    writes = []
    monkeypatch.setattr(reenrich.store, "get_settings", lambda c: {})
    monkeypatch.setattr(reenrich.store, "hunter_remaining", lambda c, d, m: 5)
    monkeypatch.setattr(reenrich.store, "incr_hunter_calls", lambda *a, **k: None)
    monkeypatch.setattr(reenrich.store, "get_enrich_backlog", lambda c, limit: [{
        "job_id": "1", "company": "Acme", "job_url": "", "job_description": "",
        "email_subject": "Cut deploy time 60%", "email_body": "Hi Hiring Team,\n\nBody",
    }])
    monkeypatch.setattr(reenrich.store, "upsert", lambda c, row: writes.append(row))
    monkeypatch.setattr(reenrich, "enrich", lambda ctx, c, s: {
        **ctx, "recruiter_email": "jane@acme.com", "recruiter_name": "Jane Doe",
        "email_source": "hunter", "email_found": True,
    })
    out = reenrich.run(cfg)
    assert out["enriched"] == 1
    final = writes[-1]
    assert final["status"] == "dry_run"
    assert final["email_subject"] == "Cut deploy time 60%"   # grounded draft preserved
    assert final["email_body"].startswith("Hi Jane,")        # re-addressed


def test_run_stamps_enriched_at_on_a_miss(monkeypatch):
    """A miss must be recorded so the next run tries different companies."""
    cfg = _cfg(hunter_api_key="KEY", hunter_daily_cap=5)
    writes = []
    monkeypatch.setattr(reenrich.store, "get_settings", lambda c: {})
    monkeypatch.setattr(reenrich.store, "hunter_remaining", lambda c, d, m: 5)
    monkeypatch.setattr(reenrich.store, "incr_hunter_calls", lambda *a, **k: None)
    monkeypatch.setattr(reenrich.store, "get_enrich_backlog",
                        lambda c, limit: [{"job_id": "1", "company": "Ghost Co", "job_url": ""}])
    monkeypatch.setattr(reenrich.store, "upsert", lambda c, row: writes.append(row))
    monkeypatch.setattr(reenrich, "enrich", lambda ctx, c, s: {**ctx, "email_found": False})
    out = reenrich.run(cfg)
    assert out["no_email"] == 1
    assert writes[-1]["enriched_at"]
    assert writes[-1].get("status") is None   # left as manual_apply
