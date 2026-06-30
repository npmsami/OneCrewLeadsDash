"""Live dry-run smoke for the website-audit pipeline.

Inserts ONE real-website test lead, runs the pipeline (send OFF by default ->
status 'dry_run'), prints the result, then DELETES the test row so the table is
left clean. Real fetch + real GPT + real Supabase; no email is sent.

    python -m scripts.smoke_audit_live
"""
from agent.config import get_config
from agent.audit import pipeline, store

TEST_EMAIL = "audit-smoke-test@example.com"  # never a real inbox; send is off anyway
TEST_WEBSITE = "https://www.onecrewtech.com"

cfg = get_config()

print("settings.send_emails =", store.get_settings(cfg).get("send_emails"))

# 1. Insert a transient pending lead.
store.upsert_lead(cfg, {
    "email": TEST_EMAIL,
    "first_name": "Test",
    "company": "OneCrew (smoke)",
    "job_title": "Owner",
    "website": TEST_WEBSITE,
    "status": "pending",
})
print("inserted test lead:", TEST_EMAIL)

try:
    # 2. Run the pipeline.
    summary = pipeline.run()
    print("run summary:", summary)

    # 3. Read it back.
    rows = store.get_client(cfg).table("audit_leads").select("*").eq("email", TEST_EMAIL).execute().data
    row = (rows or [{}])[0]
    print("\n--- resulting row ---")
    print("status          :", row.get("status"))
    print("subject         :", row.get("subject"))
    print("ai_business_name:", row.get("ai_business_name"))
    print("ai_summary      :", row.get("ai_summary"))
    print("ai_gaps         :", row.get("ai_gaps"))
    print("domain          :", row.get("domain"))
    print("email_html len  :", len(row.get("email_html") or ""))

    ok = (
        row.get("status") in ("dry_run", "sent")
        and bool(row.get("email_html"))
        and bool(row.get("subject"))
    )
    print("\nRESULT:", "LIVE DRY-RUN CLEAN" if ok else "FAILED — check fields above")
finally:
    # 4. Always clean up the transient row.
    store.delete_lead(cfg, TEST_EMAIL)
    print("deleted test lead:", TEST_EMAIL)
