"""Cold-email writer.

build_email_prompt() asks the LLM to produce the final email by FOLLOWING a
candidate-authored template (from dashboard settings): known placeholders
({company}/{role}/{recruiter_name}/{signature}) are filled in Python, and the
[bracketed instructions] are what the LLM tailors per job. write_email() returns
subject/body, with a deterministic fallback if the model output is unusable.
"""
from __future__ import annotations

import re
from typing import Any

from .config import Config
from .llm import chat, extract_json

_EMDASH = re.compile(r"\s*[—–]\s*")


def strip_dashes(text: str) -> str:
    """Hard guarantee: no em/en dashes in outgoing copy (replace with a comma)."""
    return _EMDASH.sub(", ", str(text or "")).replace(",  ", ", ")

_ACHIEVEMENTS = (
    "migrated 5 applications from GitHub to Azure DevOps; reduced deployment time by 60% through "
    "pipeline optimization; resolved critical production swap incidents via container memory management; "
    "built AWS Secrets Manager rotation alerting with Slack notifications; managed multi-cloud "
    "infrastructure across 4+ concurrent production environments; built end-to-end AI automation "
    "workflows using n8n and LLM APIs."
)
_DONT_USE = (
    '"I hope this email finds you well", "I am writing to apply", "I am passionate about", '
    '"I would love to", "Please find attached", "I came across your posting", "I am excited to"'
)

# Used when settings has no template (shouldn't happen, the column is seeded).
_DEFAULT_TEMPLATE = (
    "Hi {recruiter_name},\n\n"
    "[ONE specific observation about {company} drawn ONLY from their job post; if none, a sharp line "
    "about {role}. Vary it.]\n\n"
    "[ONE quantified achievement relevant to {role}.]\n\n"
    "[Short, natural soft CTA, offer a quick 20-minute call.]\n\n"
    "Resume attached.\n\n"
    "{signature}"
)


def _signature(profile: dict[str, Any] | None, cfg: Config) -> str:
    if profile:
        parts = [profile.get("candidate_name"), profile.get("candidate_email"), profile.get("candidate_linkedin")]
    else:
        parts = [cfg.candidate_name, cfg.candidate_email, cfg.candidate_linkedin]
    return " | ".join(str(p) for p in parts if p)


def fill_template(template: str, job: dict[str, Any], signature: str) -> str:
    """Substitute the known placeholders; leaves [bracketed] guidance for the LLM."""
    return (
        str(template or "")
        .replace("{recruiter_name}", str(job.get("recruiter_name") or "Hiring Team"))
        .replace("{company}", str(job.get("company") or "your team"))
        .replace("{role}", str(job.get("job_title") or "the role"))
        .replace("{candidate_name}", signature.split(" | ")[0] if signature else "")
        .replace("{signature}", signature)
    )


def build_email_prompt(job: dict[str, Any], cfg: Config, profile: dict[str, Any] | None = None) -> str:
    signature = _signature(profile, cfg)
    template = (profile or {}).get("email_template") or _DEFAULT_TEMPLATE
    filled = fill_template(template, job, signature)
    candidate = signature.split(" | ")[0] if signature else "the candidate"
    return "\n".join([
        f"Write a cold job-application email from {candidate}, a Senior DevOps/Cloud/AI Engineer based in "
        f"Pakistan, applying for {job.get('job_title', '')} at {job.get('company', '')}.",
        "",
        "Produce the FINAL email by following this template exactly for structure, tone and length.",
        "Replace each [bracketed instruction] with real, tailored content. Keep the non-bracketed lines "
        "(greeting, 'Resume attached.', signature) as written.",
        "",
        "TEMPLATE:",
        filled,
        "",
        "GROUNDING (strict): the opening may reference the company's tech, product, or challenge ONLY if it "
        "is stated, in those words, in the job description below, and use their own wording. If the "
        "description does NOT name a specific stack/product/challenge, do NOT mention the company's tech or "
        "what they do at all, open instead about the role itself and your relevant strength. Never infer, "
        "guess, generalize, or embellish anything about the company. Every concrete claim about them must "
        "trace to a phrase actually in this description. When unsure, leave it out:",
        str(job.get("description") or "")[:4000],
        "",
        "Quantified achievements to choose ONE from: " + _ACHIEVEMENTS,
        "",
        "Rules:",
        "- Sound natural and human, like a real engineer wrote it in two minutes. Not stiff, not salesy, not AI-generic.",
        "- Do NOT use em dashes (the '—' character) anywhere. Use commas, periods, or the word 'to'.",
        "- Vary the opening line; never begin with 'I noticed' or 'I admire'.",
        "- Match the template's length (tight, ~4-6 lines).",
        "- Confident, peer-to-peer tone, not desperate, not salesy.",
        "- Do NOT use: " + _DONT_USE,
        "- Subject: 5-8 words, specific and compelling. Do NOT start with 'Application for'. Lead with a concrete result or their stack/role.",
        "",
        "Return ONLY this JSON with no markdown or explanation:",
        '{ "subject": "subject line here", "body": "full email body here" }',
        "Return JSON only. No markdown. No backticks.",
    ])


def write_email(job: dict[str, Any], cfg: Config, profile: dict[str, Any] | None = None) -> dict[str, Any]:
    ctx = dict(job)
    response = chat(build_email_prompt(job, cfg, profile), cfg)
    _, parsed = extract_json(response)

    if parsed and parsed.get("subject") and parsed.get("body"):
        ctx["email_subject"] = strip_dashes(str(parsed["subject"]))[:150]
        ctx["email_body"] = strip_dashes(str(parsed["body"]))
        ctx["email_note"] = ""
    else:
        # Deterministic fallback: fill the template's brackets with safe generic content.
        signature = _signature(profile, cfg)
        track = str(ctx.get("matched_track") or "DevOps")
        ctx["email_subject"] = f"Senior {track} Engineer - available immediately"
        ctx["email_body"] = (
            "Hi " + str(ctx.get("recruiter_name") or "Hiring Team") + ",\n\n"
            + "Saw the " + str(ctx.get("job_title", "")) + " opening at " + str(ctx.get("company", ""))
            + ". I run multi-cloud infrastructure (AWS/Azure/GCP, Kubernetes, Terraform) and cut deployment "
            "time by 60% in my current role through CI/CD pipeline optimization.\n\n"
            "If the team is still looking, happy to walk through how I would approach your stack.\n\n"
            "Resume attached.\n\n"
            + signature
        )
        ctx["email_note"] = "LLM email generation failed - used fallback template. "
    return ctx
