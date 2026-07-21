"""Source normalizers: publisher tagging (Glassdoor/Monster) + Himalayas."""
from agent.sources import _publisher_to_source, normalize_jsearch, normalize_himalayas


def test_publisher_to_source_maps_known_boards():
    assert _publisher_to_source("Glassdoor") == "glassdoor"
    assert _publisher_to_source("Jobs via Monster") == "monster"
    assert _publisher_to_source("LinkedIn") == "linkedin"
    assert _publisher_to_source("Indeed") == "indeed"
    assert _publisher_to_source("ZipRecruiter") == "ziprecruiter"


def test_publisher_to_source_defaults_to_jsearch():
    assert _publisher_to_source("SomeRandomBoard") == "jsearch"
    assert _publisher_to_source("") == "jsearch"


def test_normalize_jsearch_tags_publisher_and_source():
    data = {"data": [{
        "job_title": "DevOps Engineer", "employer_name": "Acme",
        "job_apply_link": "https://acme.com/jobs/1", "job_publisher": "Glassdoor",
        "job_is_remote": True, "job_country": "US", "employer_website": "https://acme.com",
    }]}
    out = normalize_jsearch(data)
    assert len(out) == 1
    assert out[0]["source"] == "glassdoor"
    assert out[0]["publisher"] == "Glassdoor"
    assert out[0]["company_website"] == "https://acme.com"


def test_normalize_jsearch_unknown_publisher_is_jsearch():
    data = {"data": [{
        "job_title": "SRE", "employer_name": "Acme", "job_apply_link": "https://x",
        "job_publisher": "MegaJobBoard",
    }]}
    out = normalize_jsearch(data)
    assert out[0]["source"] == "jsearch"


def test_normalize_himalayas_basic():
    data = {"jobs": [{
        "title": "Site Reliability Engineer", "companyName": "Acme",
        "applicationLink": "https://himalayas.app/jobs/1", "locationRestrictions": ["Worldwide"],
    }]}
    out = normalize_himalayas(data)
    assert out[0]["source"] == "himalayas"
    assert out[0]["title"] == "Site Reliability Engineer"
    assert out[0]["location_tag"] == "Worldwide"
