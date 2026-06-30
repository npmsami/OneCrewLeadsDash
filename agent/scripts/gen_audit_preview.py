"""Render a representative audit email to _audit_preview.html using the REAL
seeded audit_settings (so the actual OneCrew branding + hero image show), with a
realistic sample lead + AI result. No network send. python -m scripts.gen_audit_preview
"""
import pathlib
from agent.config import get_config
from agent.audit import email_writer, store

cfg = get_config()
settings = store.get_settings(cfg)

lead = {
    "email": "dana@brightsmiledental.com", "first_name": "Dana",
    "company": "Bright Smile Dental", "job_title": "Practice Owner",
    "website": "brightsmiledental.com", "industry": "dental clinic",
    "city": "Austin", "state": "TX", "employees": "8", "revenue": "$1.2M",
}
site = {"title": "Bright Smile Dental — Austin TX", "meta": "Family & cosmetic dentistry.",
        "text": "x" * 500, "content_length": 500}
ai = {
    "business_name": "Bright Smile Dental",
    "industry": "dental clinic",
    "website_summary": "a family and cosmetic dental practice serving Austin",
    "gaps": ["No online booking", "Slow follow-up to new patient enquiries", "No after-hours capture"],
    "subject_line": "Turning more Austin visitors into booked patients",
    "growth_section_html": (
        '<p style="margin:0 0 14px;color:#3F3F46;font-size:15px;line-height:1.7;">'
        "Your site does a great job explaining your services, but a few small additions could turn "
        "more of your visitors into booked appointments without adding work for your front desk.</p>"
        '<ul style="margin:0 0 16px;padding-left:20px;">'
        '<li style="margin:0 0 9px;color:#3F3F46;font-size:15px;line-height:1.7;">'
        '<strong style="color:#0A0A0B;">Online booking widget</strong> &mdash; let patients self-schedule 24/7 instead of calling.</li>'
        '<li style="margin:0 0 9px;color:#3F3F46;font-size:15px;line-height:1.7;">'
        '<strong style="color:#0A0A0B;">Instant new-patient follow-up</strong> &mdash; auto-reply to enquiries in seconds so none slip away.</li>'
        '<li style="margin:0 0 9px;color:#3F3F46;font-size:15px;line-height:1.7;">'
        '<strong style="color:#0A0A0B;">After-hours AI receptionist</strong> &mdash; answers questions and captures details when you are closed.</li>'
        "</ul>"
        '<p style="margin:0;color:#3F3F46;font-size:15px;line-height:1.7;">'
        "Each one is quick to launch and built to fit how your practice already runs.</p>"
    ),
}

built = email_writer.build_email(settings, lead, site, ai)
out = pathlib.Path(__file__).with_name("_audit_preview.html")
out.write_text(built["html"], encoding="utf-8")
print("subject:", built["subject"])
print("hero_url in settings:", bool(settings.get("hero_url")))
print("written:", out)
