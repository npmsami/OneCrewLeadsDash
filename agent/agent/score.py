"""LLM scoring stage — port of CODE.scorePrompt + CODE.parseScore.

build_score_prompt() reproduces the master-spec scoring prompt verbatim.
score_job() calls the LLM, parses the JSON verdict, and assigns the lifecycle
status that drives routing:
    scored | geo_blocked | low_match | score_error
"""
from __future__ import annotations

from typing import Any

from .config import Config
from .llm import chat, error_message, extract_json

_CANDIDATE_STACK = (
    "AWS, Azure, GCP, Kubernetes, Docker, Terraform, Ansible, GitHub Actions, Azure DevOps, "
    "Jenkins, Grafana, Prometheus, Datadog, Nginx, Application Gateway, Bash, Python, MongoDB Atlas, "
    "PostgreSQL, DevSecOps, IAM, Secrets Management, Security Hub, n8n, LLM APIs (OpenAI, Anthropic), "
    "Agentic Workflows, API Orchestration, AI/ML Infrastructure, FinOps."
)


def build_score_prompt(job: dict[str, Any]) -> str:
    """Verbatim master-spec scoring prompt (CODE.scorePrompt)."""
    return "\n".join([
        "You are evaluating a remote job posting for a Senior Engineer based in Pakistan who is open to roles across these four tracks:",
        "",
        "Track 1 - DevOps / DevSecOps / Platform / SRE",
        "Track 2 - Cloud Engineering / Cloud Security (AWS, Azure, GCP)",
        "Track 3 - AI Engineering / AI Automation / LLMOps / GenAI Infrastructure",
        "Track 4 - DataOps / Data DevOps / MLOps / ML Infrastructure",
        "",
        "Candidate stack: " + _CANDIDATE_STACK,
        "",
        "Job Posting:",
        "Title: " + str(job.get("job_title", "")),
        "Company: " + str(job.get("company", "")),
        "Location / geo note: " + str(job.get("location_tag") or "not stated"),
        "Salary info: " + str(job.get("salary_raw") or "not stated"),
        "Description: " + str(job.get("description") or "")[:7000],
        "",
        "Evaluate and return ONLY this JSON with no markdown or explanation:",
        "",
        "{",
        '  "match_score": 0-100,',
        '  "matched_track": "DevOps | Cloud | AI/Automation | DataOps",',
        '  "matched_keywords": ["list of matched stack items"],',
        '  "missing_keywords": ["list of missing items"],',
        '  "seniority_match": true/false,',
        '  "geo_eligible": true/false,',
        '  "geo_reason": "one line reason",',
        '  "recommended_action": "apply / skip",',
        '  "skip_reason": "one line - only if skip"',
        "}",
        "",
        "geo_eligible = false IF: US only, EU residents only, requires work authorization, specific visa required, must have right to work in specific country.",
        "geo_eligible = true IF: worldwide, remote, APAC, EMEA, MENA, Asia, Pakistan, or no geographic restriction mentioned.",
        "",
        "Score across all four tracks. Use the highest matching track score.",
        "Return JSON only. No markdown. No backticks.",
    ])


def _join(v: Any) -> str:
    if isinstance(v, list):
        return "; ".join(str(x) for x in v)
    return "" if v is None else str(v)


def score_job(job: dict[str, Any], cfg: Config) -> dict[str, Any]:
    """Call the LLM and return the job dict enriched with score fields + status."""
    ctx = dict(job)
    response = chat(build_score_prompt(job), cfg)
    raw, parsed = extract_json(response)

    if not parsed or "match_score" not in parsed:
        ctx.update({
            "match_score": None, "matched_track": "", "matched_keywords": "",
            "missing_keywords": "", "seniority_match": "", "geo_eligible": None,
            "geo_reason": "", "status": "score_error",
            "notes": ("LLM scoring failed: " + error_message(response, raw))[:300],
        })
        return ctx

    try:
        score = max(0, min(100, int(float(parsed.get("match_score") or 0))))
    except (ValueError, TypeError):
        score = 0
    geo = parsed.get("geo_eligible") is True or str(parsed.get("geo_eligible")).lower() == "true"

    if score >= cfg.min_score and geo:
        status = "scored"
    elif score >= cfg.min_score:
        status = "geo_blocked"
    else:
        status = "low_match"

    ctx.update({
        "match_score": score,
        "matched_track": str(parsed.get("matched_track") or ""),
        "matched_keywords": _join(parsed.get("matched_keywords")),
        "missing_keywords": _join(parsed.get("missing_keywords")),
        "seniority_match": str(parsed.get("seniority_match") is True
                               or str(parsed.get("seniority_match")).lower() == "true").lower(),
        "geo_eligible": geo,
        "geo_reason": str(parsed.get("geo_reason") or ""),
        "status": status,
        "notes": str(parsed.get("skip_reason") or ""),
    })
    return ctx
