"""Resume tailoring — port of CODE.resumePrompt + CODE.parseResume.

build_resume_prompt() reproduces the master-spec resume prompt verbatim.
tailor_resume() calls the LLM and renders a plain-text resume + filename. If the
LLM output is unusable it falls back to the master resume so the pipeline never
stalls here. The plain text is what google.py later turns into a Drive Doc -> PDF.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from .config import Config
from .llm import chat, extract_json

_SKILL_CATEGORIES = {
    "cloud": "Cloud", "containers": "Containers", "cicd": "CI/CD", "iac": "IaC",
    "monitoring": "Monitoring", "security": "Security", "ai_automation": "AI & Automation",
    "scripting": "Scripting", "databases": "Databases",
}
_CLEAN = re.compile(r"[^a-zA-Z0-9]+")


def build_resume_prompt(job: dict[str, Any], cfg: Config) -> str:
    return "\n".join([
        "You are a resume optimization assistant. Customize this candidate's master resume for a specific job posting without fabricating anything.",
        "",
        "Master resume:",
        cfg.master_resume,
        "",
        "Job description:",
        "Title: " + str(job.get("job_title", "")) + " at " + str(job.get("company", "")),
        str(job.get("description") or "")[:6000],
        "",
        "Matched track: " + (str(job.get("matched_track") or "DevOps")),
        "",
        "Emphasis by track:",
        "Track 1 - DevOps/DevSecOps/Platform/SRE: Prioritize Kubernetes, CI/CD, Terraform, incident response, monitoring, container orchestration, deployment automation",
        "Track 2 - Cloud / Cloud Security: Prioritize multi-cloud architecture, IAM, Security Hub, secrets management, network security, VNet/VPC, compliance, FinOps",
        "Track 3 - AI / AI Automation / LLMOps: Prioritize AI/ML infrastructure, LLM API integrations, n8n workflows, agentic pipelines, Python, API orchestration, model deployment",
        "Track 4 - DataOps / MLOps: Prioritize data pipeline infrastructure, MongoDB Atlas, cloud storage, ETL orchestration, observability for data systems, ML infra support",
        "",
        "Rules:",
        "Mirror exact keywords from the job description",
        "Reorder bullets to put most relevant experience first",
        "Rewrite summary to match this specific role",
        "Never fabricate or exaggerate any experience",
        "Maximum 1 page",
        "Use action verbs and quantified achievements",
        "",
        "Return ONLY this JSON with no markdown or explanation:",
        "",
        "{",
        '  "professional_summary": "3 line tailored summary",',
        '  "experience": [ { "company": "Company Name", "role": "Job Title", "duration": "Month Year - Month Year", "bullets": ["bullet 1", "bullet 2", "bullet 3"] } ],',
        '  "skills": { "cloud": [], "containers": [], "cicd": [], "iac": [], "monitoring": [], "security": [], "ai_automation": [], "scripting": [], "databases": [] },',
        '  "certifications": [],',
        '  "education": "Degree, University, Year"',
        "}",
        "",
        "Return JSON only. No markdown. No backticks.",
    ])


def _clean_token(s: Any) -> str:
    return _CLEAN.sub("_", str(s or ""))[:40].strip("_")


def _render_resume(parsed: dict[str, Any], job: dict[str, Any], cfg: Config) -> str:
    name = cfg.candidate_name or "Mahad Saleem"
    contact = " | ".join(filter(None, [
        cfg.candidate_email, cfg.candidate_linkedin, "Lahore, Pakistan",
        "Remote (Worldwide) | Available immediately",
    ]))
    lines = [
        name.upper(),
        "Senior " + str(job.get("matched_track") or "DevOps") + " Engineer",
        contact, "", "SUMMARY", str(parsed.get("professional_summary", "")), "", "EXPERIENCE",
    ]
    for e in parsed.get("experience") or []:
        if not e:
            continue
        lines.append(f"{e.get('role', '')} - {e.get('company', '')} ({e.get('duration', '')})")
        for b in e.get("bullets") or []:
            lines.append("- " + str(b))
        lines.append("")

    lines.append("SKILLS")
    skills = parsed.get("skills") or {}
    for key, label in _SKILL_CATEGORIES.items():
        v = skills.get(key)
        if isinstance(v, list) and v:
            lines.append(f"{label}: " + ", ".join(str(x) for x in v))

    certs = parsed.get("certifications")
    if isinstance(certs, list) and certs:
        lines += ["", "CERTIFICATIONS"] + ["- " + str(c) for c in certs]
    if parsed.get("education"):
        lines += ["", "EDUCATION", str(parsed["education"])]
    return "\n".join(lines)


def tailor_resume(job: dict[str, Any], cfg: Config) -> dict[str, Any]:
    ctx = dict(job)
    response = chat(build_resume_prompt(job, cfg), cfg)
    _, parsed = extract_json(response)

    note = ""
    if parsed and parsed.get("professional_summary"):
        resume_text = _render_resume(parsed, job, cfg)
    else:
        name = cfg.candidate_name or "Mahad Saleem"
        contact = " | ".join(filter(None, [
            cfg.candidate_email, cfg.candidate_linkedin, "Lahore, Pakistan",
            "Remote (Worldwide) | Available immediately",
        ]))
        resume_text = name.upper() + "\n" + contact + "\n\n" + cfg.master_resume
        note = "LLM resume generation failed - sent master resume as-is. "

    ymd = datetime.now(tz=timezone.utc).strftime("%Y%m%d")
    ctx["resume_text"] = resume_text
    ctx["resume_filename"] = f"Mahad_Saleem_{_clean_token(ctx.get('company'))}_{_clean_token(ctx.get('job_title'))}_{ymd}.pdf"
    ctx["resume_note"] = note
    return ctx
