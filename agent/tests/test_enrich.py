"""Hunter enrichment: ranking, API status handling, and the enrich() chain."""
import agent.enrich as enrich
from agent.config import Config


class FakeResp:
    def __init__(self, status, payload=None, text=""):
        self.status_code = status
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


def _cfg(**overrides):
    cfg = Config()
    for k, v in overrides.items():
        object.__setattr__(cfg, k, v)  # frozen dataclass
    return cfg


def test_pick_hunter_prefers_hr_personal_high_confidence():
    data = {"emails": [
        {"value": "info@acme.com", "type": "generic", "department": "", "confidence": 95},
        {"value": "jane@acme.com", "type": "personal", "department": "hr", "confidence": 80},
        {"value": "bob@acme.com", "type": "personal", "department": "engineering", "confidence": 99},
    ]}
    ctx = enrich.pick_hunter({}, data)
    assert ctx["recruiter_email"] == "jane@acme.com"   # HR beats engineering/generic
    assert ctx["email_source"] == "hunter"
    assert ctx["email_confidence"] == "high"


def test_pick_hunter_no_emails_leaves_ctx_untouched():
    ctx = enrich.pick_hunter({}, {"emails": []})
    assert "recruiter_email" not in ctx


def test_hunter_search_ok(monkeypatch):
    monkeypatch.setattr(enrich.requests, "get", lambda *a, **k: FakeResp(200, {"data": {"emails": []}}))
    assert enrich.hunter_search({"company_domain": "acme.com"}, _cfg())["status"] == "ok"


def test_hunter_search_rate_limited(monkeypatch):
    monkeypatch.setattr(enrich.requests, "get", lambda *a, **k: FakeResp(429))
    assert enrich.hunter_search({"company_domain": "acme.com"}, _cfg())["status"] == "rate_limited"


def test_hunter_search_credit_limit_4xx(monkeypatch):
    monkeypatch.setattr(enrich.requests, "get",
                        lambda *a, **k: FakeResp(403, {"errors": [{"details": "usage limit reached"}]}))
    assert enrich.hunter_search({"company_domain": "acme.com"}, _cfg())["status"] == "rate_limited"


def test_hunter_search_skips_without_domain():
    assert enrich.hunter_search({}, _cfg())["status"] == "skip"


def test_enrich_hunter_found_short_circuits_and_counts(monkeypatch):
    cfg = _cfg(hunter_api_key="KEY", apollo_api_key="")
    monkeypatch.setattr(enrich, "hunter_search", lambda ctx, c: {
        "status": "ok",
        "data": {"emails": [{"value": "jane@acme.com", "type": "personal", "department": "hr", "confidence": 90}]},
    })
    ctx = {"company_website": "https://acme.com", "job_url": "https://acme.com/jobs/1"}
    state = {"remaining": 5, "used": 0, "disabled": False}
    out = enrich.enrich(ctx, cfg, state)
    assert out["recruiter_email"] == "jane@acme.com"
    assert out["email_found"] is True
    assert state["used"] == 1
    assert state["remaining"] == 4


def test_enrich_rate_limit_disables_hunter(monkeypatch):
    cfg = _cfg(hunter_api_key="KEY", apollo_api_key="")
    monkeypatch.setattr(enrich, "hunter_search", lambda ctx, c: {"status": "rate_limited"})
    ctx = {"company_website": "https://acme.com"}
    state = {"remaining": 5, "used": 0, "disabled": False}
    out = enrich.enrich(ctx, cfg, state)
    assert state["disabled"] is True
    assert out["email_found"] is False
    assert out["status"] == "scored"   # routes to manual_apply


def test_enrich_respects_exhausted_budget(monkeypatch):
    cfg = _cfg(hunter_api_key="KEY", apollo_api_key="")
    called = {"hit": False}
    monkeypatch.setattr(enrich, "hunter_search", lambda ctx, c: called.__setitem__("hit", True) or {"status": "ok", "data": {}})
    ctx = {"company_website": "https://acme.com"}
    state = {"remaining": 0, "used": 0, "disabled": False}   # no budget left
    enrich.enrich(ctx, cfg, state)
    assert called["hit"] is False   # Hunter never called
