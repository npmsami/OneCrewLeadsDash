"""Website Audit Outreach automation — the Python port of the n8n
"AI Website Audit → Personalized Cold Email (Leads)" workflow.

Reads prospect leads from Supabase (audit_leads), fetches each site, has GPT
write a personalized section, assembles the branded HTML email, and sends it
via the shared Gmail layer — gated on audit_settings.send_emails (dry-run safe).
"""
