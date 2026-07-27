"""Hunter/Apollo enrichment: ranking, lookup targeting, caching, API status handling."""
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


def _state(**overrides):
    s = {"remaining": 5, "used": 0, "disabled": False, "cache": {}}
    s.update(overrides)
    return s


# ---------------------------------------------------------------------------
# Ranking
# ---------------------------------------------------------------------------
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


def test_pick_hunter_title_beats_department():
    """A recruiter title wins even when Hunter files them under a vaguer dept.

    Real case: BairesDev's "Talent Referrals Partner" is department=executive,
    while a plain "Office Manager" is department=hr. Title is the real signal.
    """
    data = {"emails": [
        {"value": "office@acme.com", "type": "personal", "department": "hr",
         "confidence": 95, "position": "Office Manager"},
        {"value": "sol@acme.com", "type": "personal", "department": "executive",
         "confidence": 94, "position": "Talent Referrals Partner"},
    ]}
    ctx = enrich.pick_hunter({}, data)
    assert ctx["recruiter_email"] == "sol@acme.com"
    assert ctx["recruiter_title"] == "Talent Referrals Partner"


def test_pick_hunter_records_resolved_domain():
    """A name-based lookup must leave us with the domain Hunter resolved."""
    ctx = enrich.pick_hunter({}, {"domain": "BairesDev.com", "emails": []})
    assert ctx["company_domain"] == "bairesdev.com"


def test_pick_hunter_no_emails_leaves_contact_untouched():
    ctx = enrich.pick_hunter({}, {"emails": []})
    assert "recruiter_email" not in ctx


# ---------------------------------------------------------------------------
# Lookup targeting — domain when known, company NAME otherwise
# ---------------------------------------------------------------------------
def test_hunter_search_by_company_name_when_no_domain(monkeypatch):
    """LinkedIn leads have no domain; searching by name is the only path."""
    seen = {}
    monkeypatch.setattr(enrich.requests, "get",
                        lambda url, params=None, **k: seen.update(params or {}) or FakeResp(200, {"data": {}}))
    res = enrich.hunter_search({"company": "Smart Working"}, _cfg())
    assert res["status"] == "ok"
    assert seen.get("company") == "Smart Working"
    assert "domain" not in seen


def test_hunter_search_prefers_domain_over_name(monkeypatch):
    seen = {}
    monkeypatch.setattr(enrich.requests, "get",
                        lambda url, params=None, **k: seen.update(params or {}) or FakeResp(200, {"data": {}}))
    enrich.hunter_search({"company_domain": "acme.com", "company": "Acme"}, _cfg())
    assert seen.get("domain") == "acme.com"
    assert "company" not in seen


def test_hunter_search_skips_reposter_company():
    assert enrich.hunter_search({"company": "JobHub"}, _cfg())["status"] == "skip"


def test_hunter_search_skips_with_nothing_to_search():
    assert enrich.hunter_search({}, _cfg())["status"] == "skip"


def test_normalize_company_strips_legal_suffix():
    assert enrich.normalize_company("Acme Technologies, Inc.") == "acme technologies"
    assert enrich.normalize_company("  Smart   Working  ") == "smart working"


def test_is_lookupable_rejects_reposters_and_blanks():
    assert enrich.is_lookupable({"company": "BairesDev"}) is True
    assert enrich.is_lookupable({"company": "Hire Feed"}) is False
    assert enrich.is_lookupable({"company": ""}) is False
    # A real domain is enough even if the name is junk.
    assert enrich.is_lookupable({"company": "JobHub", "company_domain": "acme.com"}) is True


def test_extract_domain_ignores_linkedin_job_urls():
    assert enrich.extract_domain({"job_url": "https://pk.linkedin.com/jobs/view/devops-at-codup-123"}) == ""
    assert enrich.extract_domain({"job_url": "https://careers.acme.com/jobs/1"}) == "acme.com"


# ---------------------------------------------------------------------------
# API status handling
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# enrich() chain
# ---------------------------------------------------------------------------
def test_enrich_hunter_found_short_circuits_and_counts(monkeypatch):
    cfg = _cfg(hunter_api_key="KEY", apollo_api_key="")
    monkeypatch.setattr(enrich, "hunter_search", lambda ctx, c: {
        "status": "ok",
        "data": {"emails": [{"value": "jane@acme.com", "type": "personal", "department": "hr", "confidence": 90}]},
    })
    ctx = {"company": "Acme", "company_website": "https://acme.com", "job_url": "https://acme.com/jobs/1"}
    state = _state()
    out = enrich.enrich(ctx, cfg, state)
    assert out["recruiter_email"] == "jane@acme.com"
    assert out["email_found"] is True
    assert state["used"] == 1
    assert state["remaining"] == 4


def test_enrich_caches_per_company_across_jobs(monkeypatch):
    """Ten jobs at one company must cost ONE search."""
    cfg = _cfg(hunter_api_key="KEY", apollo_api_key="")
    calls = {"n": 0}

    def fake(ctx, c):
        calls["n"] += 1
        return {"status": "ok", "data": {"domain": "acme.com", "emails": [
            {"value": "jane@acme.com", "type": "personal", "department": "hr", "confidence": 90}]}}

    monkeypatch.setattr(enrich, "hunter_search", fake)
    state = _state()
    for i in range(4):
        out = enrich.enrich({"company": "Acme", "job_id": str(i)}, cfg, state)
        assert out["recruiter_email"] == "jane@acme.com"
    assert calls["n"] == 1
    assert state["used"] == 1
    assert state["cache_hits"] == 3


def test_enrich_caches_misses_too(monkeypatch):
    """A company that yields nothing isn't paid for twice."""
    cfg = _cfg(hunter_api_key="KEY", apollo_api_key="")
    calls = {"n": 0}
    monkeypatch.setattr(enrich, "hunter_search",
                        lambda ctx, c: calls.__setitem__("n", calls["n"] + 1) or {"status": "ok", "data": {}})
    state = _state()
    enrich.enrich({"company": "Ghost Co"}, cfg, state)
    out = enrich.enrich({"company": "Ghost Co"}, cfg, state)
    assert calls["n"] == 1
    assert out["email_found"] is False


def test_enrich_rate_limit_disables_hunter(monkeypatch):
    cfg = _cfg(hunter_api_key="KEY", apollo_api_key="")
    monkeypatch.setattr(enrich, "hunter_search", lambda ctx, c: {"status": "rate_limited"})
    ctx = {"company": "Acme", "company_website": "https://acme.com"}
    state = _state()
    out = enrich.enrich(ctx, cfg, state)
    assert state["disabled"] is True
    assert out["email_found"] is False
    assert out["status"] == "scored"   # routes to manual_apply


def test_enrich_respects_exhausted_budget(monkeypatch):
    cfg = _cfg(hunter_api_key="KEY", apollo_api_key="")
    called = {"hit": False}
    monkeypatch.setattr(enrich, "hunter_search",
                        lambda ctx, c: called.__setitem__("hit", True) or {"status": "ok", "data": {}})
    enrich.enrich({"company": "Acme"}, cfg, _state(remaining=0))
    assert called["hit"] is False   # Hunter never called


def test_enrich_falls_back_to_apollo(monkeypatch):
    cfg = _cfg(hunter_api_key="KEY", apollo_api_key="APOLLO")
    monkeypatch.setattr(enrich, "hunter_search", lambda ctx, c: {"status": "ok", "data": {"domain": "acme.com"}})
    monkeypatch.setattr(enrich, "apollo_search", lambda ctx, c: {"people": [
        {"email": "rec@acme.com", "name": "Rey Cruz", "title": "Technical Recruiter"}]})
    out = enrich.enrich({"company": "Acme"}, cfg, _state())
    assert out["recruiter_email"] == "rec@acme.com"
    assert out["email_source"] == "apollo"
    assert out["recruiter_title"] == "Technical Recruiter"


def test_apollo_plan_rejection_disables_apollo(monkeypatch):
    cfg = _cfg(hunter_api_key="", apollo_api_key="APOLLO")
    monkeypatch.setattr(enrich.requests, "post", lambda *a, **k: FakeResp(403, text="insufficient plan"))
    state = _state(disabled=True)
    enrich.enrich({"company": "Acme"}, cfg, state)
    assert state["apollo_disabled"] is True


def test_pick_apollo_ignores_locked_placeholder_emails():
    ctx = enrich.pick_apollo({}, {"people": [{"email": "email_not_unlocked@domain.com", "name": "X"}]})
    assert "recruiter_email" not in ctx


def test_hunter_pagination_error_is_not_a_credit_stop(monkeypatch):
    """Free plan caps results at 10 and 400s on a bigger limit. That must not
    be mistaken for an exhausted allowance and disable Hunter for the run."""
    monkeypatch.setattr(enrich.requests, "get", lambda *a, **k: FakeResp(400, {"errors": [
        {"id": "pagination_error", "code": 400,
         "details": "The search results are limited to 10 email addresses on your current plan."}]}))
    assert enrich.hunter_search({"company_domain": "acme.com"}, _cfg())["status"] == "error"


def test_hunter_usage_limit_id_is_a_credit_stop(monkeypatch):
    monkeypatch.setattr(enrich.requests, "get", lambda *a, **k: FakeResp(
        403, {"errors": [{"id": "usage_limit_reached", "details": "no searches left"}]}))
    assert enrich.hunter_search({"company_domain": "acme.com"}, _cfg())["status"] == "rate_limited"


def test_hunter_search_requests_a_plan_safe_result_limit(monkeypatch):
    seen = {}
    monkeypatch.setattr(enrich.requests, "get",
                        lambda url, params=None, **k: seen.update(params or {}) or FakeResp(200, {"data": {}}))
    enrich.hunter_search({"company_domain": "acme.com"}, _cfg())
    assert seen["limit"] <= 10
