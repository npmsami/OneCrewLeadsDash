# Setup Guide — Job Application Agent

Everything you need to go from import → first dry run, in three parts:

- **Part 1 — Config:** every field, exactly where to get its value
- **Part 2 — Nodes:** what every node does, step by step, and which ones need your attention
- **Part 3 — Google Sheet:** every column, which node writes it, and what the value looks like

Recommended order: create the Sheet (Part 3) → collect keys & credentials (Part 1) → import the workflow → fill Config → attach credentials per the node table (Part 2) → click `Manual Test`.

---

## PART 1 — CONFIG: every field and where to get it

Open the **Config** node (the Set node right after the triggers). Fields marked 🔁 also exist in **Config (Follow-up)** — set them in **both** places.

### 1.1 LLM (the brain — scoring, resume, emails)

| Field | Set it to | Where to get it |
|---|---|---|
| `LLM_API_BASE` 🔁 | `https://api.openai.com/v1/chat/completions` | Already set — OpenAI's chat-completions endpoint. Leave as is. |
| `LLM_MODEL` 🔁 | `gpt-4o-mini` | Already set. Upgrade options in §1.6. |
| `LLM_API_KEY` 🔁 | `sk-...` | **OpenAI:** 1) Sign in at https://platform.openai.com 2) **Settings → Billing** → add at least **$5 credit** (the API refuses requests with a $0 balance — error 429 `insufficient_quota`) 3) **API keys → Create new secret key** 4) Copy the `sk-...` value immediately (shown once). |

### 1.2 Email finding

| Field | Set it to | Where to get it |
|---|---|---|
| `HUNTER_API_KEY` | your key | 1) Sign up free at https://hunter.io 2) Verify your email 3) Go to https://hunter.io/api-keys (Account menu → API) 4) Copy the key. Free plan = **25 searches/month** — enough for testing at 10 jobs/run for ~2 runs. |
| `APOLLO_API_KEY` | *(leave empty)* | Optional fallback — **not free in any useful way, unlike Hunter.** Key location: app.apollo.io → **Settings → Integrations → API** (`app.apollo.io/#/settings/integrations/api-keys`) → create key with **"Set as master key"** ticked. But note: free accounts can call People *Search*, and per Apollo's docs it **returns no email addresses at all** — emails require the paid People *Enrichment* endpoint (consumes credits). So on a free account Apollo adds nothing here. **Leave blank; the workflow skips it cleanly** (Hunter → `careers@` pattern → manual_apply is the free path). If you ever buy an Apollo plan, repoint the `Apollo: Find People` node to `people/match` (enrichment) to get real emails. |

### 1.3 Google Sheet & Drive

| Field | Set it to | Where to get it |
|---|---|---|
| `SHEET_ID` 🔁 | long ID string | Open your sheet; the URL is `https://docs.google.com/spreadsheets/d/`**`1AbCdEf...XyZ`**`/edit` — copy the bold middle part (between `/d/` and `/edit`). |
| `SHEET_TAB` 🔁 | `applications` | Must match the tab name at the bottom of the sheet **exactly** (rename the default "Sheet1" tab to `applications`, or change this field to whatever your tab is called). |
| `DRIVE_FOLDER_ID` | *(optional)* | Create a folder in Google Drive (e.g. "Job Applications"), open it; URL is `https://drive.google.com/drive/folders/`**`1aBcD...`** — copy the part after `/folders/`. Leave empty → resume docs land in My Drive root (everything still works). |

### 1.4 Telegram notifications — full walkthrough

You need **two different things**, and people mix them up:
- a **bot token** → goes into the n8n *Telegram credential* (a login), **not** into Config
- a **chat ID** → goes into Config field `TELEGRAM_CHAT_ID` (where to send messages)

**Step A — make the bot & get the token (this is the "access token" you were missing):**
1. In Telegram, search for **@BotFather** (the official one, blue checkmark) and open it.
2. Send `/newbot`.
3. It asks for a **name** (anything, e.g. `Mahad Job Agent`).
4. It asks for a **username** ending in `bot` (e.g. `mahad_job_agent_bot` — must be unique).
5. BotFather replies with a line like:
   `Use this token to access the HTTP API:` **`7421337123:AAH8k9d...long...string`**
   → **That whole string is your bot token / access token.** Copy it. (Lost it later? Send BotFather `/mytoken` or `/revoke`.)
   This token goes into the **n8n Telegram credential** in Step C — *not* into the Config node.

**Step B — get your chat ID:**
1. In Telegram, open a chat with the bot you just made and tap **Start** (or send it `hi`). Bots can't message you until you message them first.
2. Easiest: search **@userinfobot**, open it, send any message — it replies with **`Id: 5034921877`**. That number is your `TELEGRAM_CHAT_ID`.
   *(Alternative without a second bot: open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser after messaging your bot, and read `"chat":{"id":5034921877`.)*
3. Paste that number into **Config → `TELEGRAM_CHAT_ID`** (and into Config (Follow-up)).

**Step C — create the n8n Telegram credential** (this is what clears the ⚠️ on every `TG:` node): see Part 2 → §"Telegram credential". You'll paste the **token from Step A** there.

| Field | Set it to | From |
|---|---|---|
| `TELEGRAM_CHAT_ID` 🔁 | a number like `5034921877` | Step B above |

### 1.5 Behavior knobs & candidate identity

| Field | Default | What it does / what to put |
|---|---|---|
| `SEND_EMAILS` 🔁 | `false` | **The safety switch.** `false` = full pipeline runs but nothing is emailed (rows get `status=dry_run`, you get 🧪 Telegram previews). Set to `true` — in **both** Config nodes — only after you've reviewed a few dry-run resumes and subjects. |
| `MIN_SCORE` | `70` | Apply threshold from the spec. Jobs scoring below it → `low_match`. |
| `LOOKBACK_HOURS` | `48` | Only jobs posted within this window survive (spec says 48 h). If a test run finds too few jobs, raise to `168` (1 week), test, then put it back. |
| `MAX_JOBS_PER_RUN` | `10` | Caps how many *new* jobs go to scoring per run — your "test with 10 jobs" knob. Raise once stable (watch Hunter's 25/month quota). |
| `CANDIDATE_NAME` 🔁 | `Mahad Saleem` | Used in resume headers and email signatures. |
| `CANDIDATE_EMAIL` 🔁 | **replace placeholder** | Use the same Gmail address the workflow sends from — recruiters see it in the signature. |
| `CANDIDATE_LINKEDIN` 🔁 | **replace placeholder** | Your public profile URL: `https://www.linkedin.com/in/<your-handle>` (find it on your profile → "Contact info" or the browser address bar). |
| `MASTER_RESUME` | template included | The source of truth the LLM tailors per job (it is instructed never to invent anything beyond this). **Edit the `[FILL ME IN]` parts:** NETSOL start date, earlier role(s), certifications, education. Keep it plain text. |

### 1.6 OpenAI model options (change `LLM_MODEL` only)

| Model | When to use it |
|---|---|
| `gpt-4o-mini` *(default)* | Cheapest; fine for scoring/dedup-scale testing. Runs at `temperature: 0` for consistent JSON verdicts. |
| `gpt-4.1-mini` | Noticeably better resume/email writing, still cheap. |
| `gpt-5-mini` / `gpt-5` | Reasoning models — best quality. They reject the `temperature` parameter, and the workflow automatically omits it for any `gpt-5*`/`o*` model, so switching is safe. |

All four LLM calls (score, resume, cold email, follow-up) use these same three Config fields — there is nothing to configure on the LLM nodes themselves.

### 1.7 n8n credentials (not in Config — attached on nodes)

Five credentials are referenced by the workflow. After import, nodes show a ⚠ until you attach yours.

**Google (Sheets, Gmail, Drive — one Google Cloud setup covers all three):**

1. Go to https://console.cloud.google.com → create a project (e.g. `n8n-job-agent`).
2. **APIs & Services → Library** → enable three APIs: **Google Sheets API**, **Gmail API**, **Google Drive API**. *(No Google Docs API needed — the resume is created and exported entirely through the Drive node.)*
3. **APIs & Services → OAuth consent screen** → External → fill app name + your email → add **yourself as a Test user**. (Staying in "Testing" mode is fine, but Google then expires the login every 7 days — reconnect the credentials weekly, or publish the app to stop that.)
4. **Credentials → Create credentials → OAuth client ID → Web application**. For "Authorized redirect URI", paste the **OAuth Redirect URL shown inside n8n's credential dialog** (looks like `https://<your-n8n>/rest/oauth2-credential/callback`).
5. Copy the **Client ID** and **Client Secret**.
6. In n8n create three credentials, pasting the *same* Client ID/Secret into each, then click "Sign in with Google" on each:
   - `Google Sheets OAuth2 API` → name it **Google Sheets account**
   - `Gmail OAuth2 API` → **Gmail account**
   - `Google Drive OAuth2 API` → **Google Drive account**

**Telegram credential:**
1. n8n → **Credentials → Create credential** → search and pick **`Telegram API`**.
2. In **Access Token**, paste the **bot token** from §1.4 Step A (the `7421337123:AAH8k...` string from BotFather).
3. Save → name it **Telegram Bot**. That single credential clears the ⚠️ on all 10 `TG:` nodes.

---

## PART 2 — NODE BY NODE

"You do" column: **—** means the node is fully configured; just leave it.

### A. Triggers & settings

| # | Node | Type | What it does | You do |
|---|---|---|---|---|
| 1 | `Every 12 Hours` | Schedule Trigger | Fires the discovery pipeline every 12 h (only once the workflow is **Active**). | — |
| 2 | `Manual Test` | Manual Trigger | Same pipeline on demand — your test button. | Click **Execute workflow** while testing |
| 3 | `Config` | Set | Single place for all settings (Part 1). | **Fill every placeholder** |

### B. Stage 1 — Discovery (4 layers → free sources)

| # | Node | Type | What it does | You do |
|---|---|---|---|---|
| 4 | `Fetch RemoteOK` | HTTP GET | `remoteok.com/api` — all recent remote jobs. Survives failures (`onError: continue`). | — |
| 5 | `Fetch Remotive` | HTTP GET | `remotive.com` software-dev category. | — |
| 6 | `Fetch Arbeitnow` | HTTP GET | EU-heavy board; only `remote: true` jobs are kept later. | — |
| 7 | `Fetch Jobicy` | HTTP GET | DevOps-tagged remote jobs. | — |
| 8 | `Fetch Himalayas` | HTTP GET | Remote jobs incl. location-restriction data. | — |
| 9 | `Fetch WWR RSS` | RSS Read | WeWorkRemotely DevOps/sysadmin feed. | — |
| 10–15 | `Normalize RemoteOK/Remotive/Arbeitnow/Jobicy/Himalayas/WWR` | Code | Each maps its source's raw fields into one common shape: `title, company, url, location_tag, posted_at, description, tags, salary_raw, source`. Bad/error responses → 0 items, never a crash. | — |
| 16 | `Merge Sources` | Merge (append ×6) | Combines all sources into one job list. | — (Apify/LinkedIn nodes plug in here later) |

### C. Stages 1–2 — Filters & dedup

| # | Node | Type | What it does | You do |
|---|---|---|---|---|
| 17 | `Hard Filters` | Code | The spec's scrape-level filters: role-keyword match; reject junior/intern/onsite/hybrid; reject country-locked posts (e.g. "USA", "EU residents only", "US work authorization"); posted within `LOOKBACK_HOURS`; **NETSOL excluded**; de-dupes within the batch; builds the `job_id` hash (title+company+url). | — |
| 18 | `Read Sheet Log` | Google Sheets | Reads every existing row for dedup. Works on an empty sheet (first run). | Attach **Google Sheets account** |
| 19 | `Filter New Jobs` | Code | Drops jobs already in the sheet — by `job_id` **and** by title+company (same role on two boards = one application). Caps at `MAX_JOBS_PER_RUN`. | — |
| 20 | `Log New Jobs` | Google Sheets | Appends each new job, `status=new`. | Attach Sheets credential |

### D. Stage 3 — Match score + geo

| # | Node | Type | What it does | You do |
|---|---|---|---|---|
| 21 | `Build Score Prompt` | Code | Builds the spec's exact Stage-3 evaluation prompt (4 tracks, candidate stack, geo rules) + the OpenAI request body. | — |
| 22 | `LLM: Score Job` | HTTP POST | Calls the LLM, 1 request / 6 s. | — |
| 23 | `Parse Score` | Code | Parses the JSON verdict → sets `status`: `scored` (≥70 + geo OK) / `geo_blocked` / `low_match` / `score_error` (LLM failed — job is never lost silently). | — |
| 24 | `Save Score` | Google Sheets | Writes score columns to the row. | Attach Sheets credential |
| 25 | `Route by Score` | Switch | 4-way fork on status. | — |
| 26–28 | `TG: Geo Blocked` / `TG: Low Match` / `TG: Score Error` | Telegram | 🚫 / 📊 / ⚠️ notifications for skipped jobs. | Attach **Telegram Bot** |

### E. Stage 4 — Recruiter email enrichment

| # | Node | Type | What it does | You do |
|---|---|---|---|---|
| 29 | `Extract Domain` | Code | Company domain from the job URL — unless it's a job-board host (then Hunter searches by company *name* instead). | — |
| 30 | `Hunter: Find Email` | HTTP GET | Hunter domain-search (1 free credit per job). | — |
| 31 | `Pick Hunter Email` | Code | Best contact: recruiter/talent/HR → generic `careers@` → engineering leadership → highest confidence. Maps confidence to high/medium/low. | — |
| 32 | `Hunter Found?` | IF | Email found → skip Apollo. | — |
| 33 | `Apollo: Find People` | HTTP POST | Fallback people-search by recruiter titles. Empty key → harmless failure, moves on. | — |
| 34 | `Pick Apollo Email` | Code | Accepts only real unlocked addresses. | — |
| 35 | `Finalize Email` | Code | Last resort `careers@<domain>` pattern; sets `email_found`. No email + no domain → manual path. | — |
| 36 | `Save Enrichment` | Google Sheets | Writes recruiter columns, `status=enriched`. | Attach Sheets credential |

### F. Stage 5 — Resume

| # | Node | Type | What it does | You do |
|---|---|---|---|---|
| 37 | `Build Resume Prompt` | Code | Spec's Stage-5 prompt: your `MASTER_RESUME` + the JD + track-specific emphasis + "never fabricate". | — |
| 38 | `LLM: Tailor Resume` | HTTP POST | Generates the tailored resume JSON. | — |
| 39 | `Parse Resume` | Code | Renders it to a clean text resume; builds the filename `Mahad_Saleem_<Company>_<Role>_<YYYYMMDD>.pdf`. LLM failure → falls back to the master resume so the pipeline never stalls. | — |
| 40 | `Create Resume Doc` | **Google Drive** (Create from Text) | Turns the resume text into a Google Doc named with that filename, placed in `DRIVE_FOLDER_ID` (or My Drive root if empty) — all in one node. | Attach **Google Drive account** |
| 41 | `Save Resume Link` | Google Sheets | Writes `resume_filename` + `resume_drive_link` (the Doc's link). | Attach Sheets credential |

### G. Stages 6–7 — Cold email & send (or dry run / manual)

| # | Node | Type | What it does | You do |
|---|---|---|---|---|
| 42 | `Email Found?` | IF | Recruiter email exists → email path; else manual path. | — |
| 43 | `Build Email Prompt` | Code | Spec's Stage-6 prompt: 6-line max, banned phrases, one company-specific detail, one quantified achievement, "Resume attached.", your signature. | — |
| 44 | `LLM: Cold Email` | HTTP POST | Writes subject + body. | — |
| 45 | `Parse Cold Email` | Code | Parses it; unusable output → solid fallback template. | — |
| 46 | `Send Enabled?` | IF | The `SEND_EMAILS` gate. | Flip via Config when ready |
| 47 | `Export Resume PDF` | **Google Drive** (Download) | Exports the Doc as a PDF binary to attach. | Attach Drive credential |
| 48 | `Set PDF Filename` | Code | Names the attachment correctly. | — |
| 49 | `Gmail: Send Application` | Gmail | Sends to the recruiter with PDF attached (no "sent by n8n" footer). | Attach **Gmail account** |
| 50 | `Mark Applied` | Google Sheets | `status=applied`, `applied_at`, `email_subject`. | Attach Sheets credential |
| 51 | `TG: Applied` | Telegram | ✅ "Applied to [Role] ([Track]) at [Company]". | Attach Telegram Bot |
| 52 | `Mark Dry Run` | Google Sheets | Test mode: `status=dry_run` + the would-be subject. | Attach Sheets credential |
| 53 | `TG: Dry Run` | Telegram | 🧪 preview of who/what would have been sent. | Attach Telegram Bot |
| 54 | `Mark Manual Apply` | Google Sheets | No email found: `status=manual_apply` (resume already created!). | Attach Sheets credential |
| 55 | `TG: Manual Apply` | Telegram | ⚠️ job link + resume link so you can apply by hand. | Attach Telegram Bot |

### H. Stage 8 — Follow-up engine (separate daily flow, same canvas)

| # | Node | Type | What it does | You do |
|---|---|---|---|---|
| 56 | `Daily Follow-up Check` | Schedule Trigger | Every day 09:00 Asia/Karachi. | — |
| 57 | `Config (Follow-up)` | Set | Mirror of the 🔁 fields. | **Keep in sync with Config** |
| 58 | `Read All Rows` | Google Sheets | All logged applications. | Attach Sheets credential |
| 59 | `Gmail: Recent Inbox` | Gmail | Last 14 days of inbox, used for reply detection. | Attach Gmail credential |
| 60 | `Select Due Actions` | Code | Per row: reply from recruiter's address → `replied`; applied ≥ **5 business days** + silence → `followup`; followed-up ≥ **3 days** + silence → `close`. Closed rows are never touched again. | — |
| 61 | `Route Follow-up` | Switch | 3-way fork. | — |
| 62–63 | `Mark Replied` → `TG: Reply Received` | Sheets + Telegram | `status=replied` + 📩 alert. | credentials |
| 64–66 | `Build FU Prompt` → `LLM: Follow-up` → `Parse Follow-up` | Code/HTTP/Code | Spec's 2-line, zero-desperation follow-up (with fallback). | — |
| 67 | `Send FU Enabled?` | IF | Same `SEND_EMAILS` gate. | — |
| 68–70 | `Gmail: Send Follow-up` → `Mark Followed Up` → `TG: Follow-up Sent` | Gmail/Sheets/Telegram | Sends, sets `status=followed_up` + `followup_sent=true`, 📬 alert. | credentials |
| 71–72 | `Mark FU Dry Run` → `TG: FU Dry Run` | Sheets + Telegram | Test mode equivalent (still marks `followup_sent` so it can't loop). | credentials |
| 73–74 | `Mark Closed` → `TG: Closed` | Sheets + Telegram | `status=closed` + 🔒 alert. Never a third email. | credentials |

---

## PART 3 — GOOGLE SHEET: columns & values

### 3.1 Create the sheet

1. New Google Sheet → rename it anything (e.g. *Job Applications Log*).
2. Rename the tab at the bottom-left to **`applications`** — it must match Config `SHEET_TAB` exactly (lowercase, no spaces). The workflow does **not** create the tab for you.
3. Click cell **A1** and paste this single line — it auto-splits into 28 columns (it's tab-separated). Paste into **A1 only**, not across multiple cells:

```
job_id	job_title	company	matched_track	source	job_url	posted_date	scraped_at	match_score	geo_eligible	geo_reason	seniority_match	matched_keywords	missing_keywords	recruiter_name	recruiter_email	email_confidence	email_source	resume_filename	resume_drive_link	email_subject	applied_at	reply_received	reply_date	followup_sent	followup_date	status	notes
```

4. Copy the **Sheet ID** from the URL (the part between `/d/` and `/edit`) into Config `SHEET_ID` (and Config (Follow-up)).

**Rules:**
- Headers stay in **row 1** with these exact lowercase names — the nodes map by header name, not column position.
- Don't rename, delete, or reorder columns. Adding *extra* columns to the right for your own notes is fine.
- No formatting, colors, or filters needed (optional nicety: select row 1 → **View → Freeze → 1 row** so the header stays visible).
- The workflow only **appends new rows** and **updates existing ones by `job_id`** — it never deletes. Your data is safe, and the sheet doubles as the permanent dedup memory, so don't delete rows for jobs you don't want re-applied to.

**Verify it's wired right:** after your first `Manual Test` run, rows should appear with `status` filling in (`new` → `scored`/`low_match`/… → `dry_run`). If nothing appears, the `SHEET_ID`/`SHEET_TAB` or the Google Sheets credential is the thing to check.

### 3.2 Column-by-column reference

| # | Column | Written by (node) | Value & example |
|---|---|---|---|
| 1 | `job_id` | `Log New Jobs` | Dedup hash of title+company+URL. Every later node updates the row by matching this. Ex: `jd4a1b2c3e5f60718` |
| 2 | `job_title` | `Log New Jobs` | Ex: `Senior DevOps Engineer` |
| 3 | `company` | `Log New Jobs` | Ex: `Runware` |
| 4 | `matched_track` | `Save Score` | Which of the 4 tracks the LLM matched: `DevOps` \| `Cloud` \| `AI/Automation` \| `DataOps` |
| 5 | `source` | `Log New Jobs` | Which board found it: `remoteok` \| `remotive` \| `arbeitnow` \| `jobicy` \| `himalayas` \| `weworkremotely` |
| 6 | `job_url` | `Log New Jobs` | Link to the posting. Ex: `https://weworkremotely.com/remote-jobs/runware-staff-devops-engineer` |
| 7 | `posted_date` | `Log New Jobs` | When the job was posted (ISO). Ex: `2026-06-11T11:33:28.000Z` (empty if the feed gave no date) |
| 8 | `scraped_at` | `Log New Jobs` | When we found it. Ex: `2026-06-12T18:02:11.483Z` |
| 9 | `match_score` | `Save Score` | LLM fit score `0–100`. Ex: `88`. ≥ `MIN_SCORE` (70) proceeds. Empty if scoring errored. |
| 10 | `geo_eligible` | `Save Score` | `true` \| `false` — can someone in Pakistan be hired for it? |
| 11 | `geo_reason` | `Save Score` | One-liner from the LLM. Ex: `Worldwide remote, no restriction mentioned` or `US only - requires work authorization` |
| 12 | `seniority_match` | `Save Score` | `true` \| `false` — senior-level fit. |
| 13 | `matched_keywords` | `Save Score` | Stack overlaps, `; `-separated. Ex: `Kubernetes; Terraform; AWS; GitHub Actions` |
| 14 | `missing_keywords` | `Save Score` | What the JD wants that the profile lacks. Ex: `GCP; Rust` |
| 15 | `recruiter_name` | `Save Enrichment` | Ex: `Sara Khan` — or `Hiring Team` when only a generic inbox was found. |
| 16 | `recruiter_email` | `Save Enrichment` | Where the application goes. Ex: `sara.khan@acme.io` or `careers@acme.io` |
| 17 | `email_confidence` | `Save Enrichment` | `high` (Hunter ≥70) \| `medium` (40–69, Apollo, or pattern) \| `low` |
| 18 | `email_source` | `Save Enrichment` | `hunter` \| `apollo` \| `pattern` (careers@ guess) |
| 19 | `resume_filename` | `Save Resume Link` | Ex: `Mahad_Saleem_Runware_Staff_DevOps_Engineer_20260612.pdf` |
| 20 | `resume_drive_link` | `Save Resume Link` | Google Doc of the tailored resume. Ex: `https://docs.google.com/document/d/1aB.../edit` |
| 21 | `email_subject` | `Mark Applied` / `Mark Dry Run` | The cold-email subject. Ex: `Senior DevOps Engineer - 60% faster deployments` |
| 22 | `applied_at` | `Mark Applied` | When the email was actually sent (ISO). Ex: `2026-06-12T18:05:42.000+05:00`. Stays empty in dry runs — the 5-day follow-up clock starts here. |
| 23 | `reply_received` | `Mark Replied` | `true` once a reply from `recruiter_email` lands in your inbox. |
| 24 | `reply_date` | `Mark Replied` | When the reply was detected (ISO). |
| 25 | `followup_sent` | `Mark Followed Up` / `Mark FU Dry Run` | `true` after the one-and-only follow-up. |
| 26 | `followup_date` | `Mark Followed Up` / `Mark FU Dry Run` | When (ISO) — the 3-day close clock starts here. |
| 27 | `status` | many (see 3.3) | The row's lifecycle state — the most important column. |
| 28 | `notes` | `Save Score` / `Mark *` | Skip reasons, LLM-failure messages, dry-run markers. Ex: `TEST MODE: email NOT sent (SEND_EMAILS=false).` |

### 3.3 `status` values (lifecycle)

| Value | Set by | Meaning / what happens next |
|---|---|---|
| `new` | `Log New Jobs` | Discovered & logged; heading to scoring. |
| `scored` | `Save Score` | ≥70 + geo-eligible → continues to enrichment. (Also the resting state if enrichment found no email yet.) |
| `geo_blocked` | `Save Score` | Good match but can't hire from Pakistan. Stops. 🚫 |
| `low_match` | `Save Score` | Score < 70. Stops. 📊 |
| `score_error` | `Save Score` | LLM call failed — job kept for retry/inspection, never silently lost. ⚠️ |
| `enriched` | `Save Enrichment` | Recruiter email found; resume + email generation next. |
| `manual_apply` | `Mark Manual Apply` | No email found anywhere — but the tailored resume is ready; Telegram gives you both links to apply by hand. ⚠️ |
| `dry_run` | `Mark Dry Run` | **Test mode only:** everything generated, nothing sent. Review these rows, then enable sending. 🧪 |
| `applied` | `Mark Applied` | Cold email + PDF sent. Follow-up timer (5 business days) running. ✅ |
| `followed_up` | `Mark Followed Up` | One follow-up sent. Close timer (3 days) running. 📬 |
| `replied` | `Mark Replied` | Recruiter answered — your turn, check the inbox. 📩 |
| `closed` | `Mark Closed` | No response after follow-up. Permanently done — never emailed again. 🔒 |

Rows are deduplicated against this sheet forever: anything with the same `job_id` **or** the same title+company is never processed twice, and per the spec, rows with `status=applied`/`closed` are never re-applied to.

---

## PART 4 — GO LIVE (switch from test to real sending)

The workflow ships in **safe test mode** (`SEND_EMAILS=false`): it discovers, scores, enriches, builds resumes and writes the email — but **does not send anything**. Rows get `status=dry_run` and you get 🧪 Telegram previews. Stay here until you trust the output.

**Pre-flight — review a few dry-run results first:**
1. Run `Manual Test` a couple of times.
2. Open the sheet → look at `dry_run` rows: are the `match_score`s sensible, the `recruiter_email`s real, the `email_subject`s good?
3. Open 2–3 `resume_drive_link` Google Docs in Drive — is the tailored resume accurate and free of fabrication?
4. Read the 🧪 Telegram previews — would you actually send those emails?

**Flip to live (one switch):**
1. Open the **Config** node → set `SEND_EMAILS` to **`true`**.
2. Open the **Config (Follow-up)** node → set `SEND_EMAILS` to **`true`** as well. *(Both, or the main pipeline sends but follow-ups stay in test mode.)*
3. Click **Save**.
4. Toggle the workflow **Active** (top-right). Now `Every 12 Hours` and `Daily Follow-up Check` run on their own — real cold emails go out from your Gmail, and the sheet starts logging `status=applied`.

**First live run — do it watched:** instead of waiting for the 12-hour cron, set `MAX_JOBS_PER_RUN` to `1`, run `Manual Test` once, and confirm exactly one real email left your Gmail **Sent** folder and the row flipped to `applied`. Then raise the cap back to `10`+ and leave it on the schedule.

**To pause sending later:** flip `SEND_EMAILS` back to `false` (stays in test mode) or just toggle the workflow inactive.

> ⚠️ Live mode sends real cold emails to real recruiters from your account. Keep `MAX_JOBS_PER_RUN` modest at first, and remember Hunter's free tier is 25 lookups/month — going live burns those on every applied job.
