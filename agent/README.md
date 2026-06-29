# Job Application Agent — n8n workflow (free-tier test build)

Autonomous job application pipeline for Mahad Saleem (Senior DevOps / Cloud / AI Engineer, Lahore, remote-only).
Implements the full master spec end to end: **discover → dedup → LLM score + geo check → email enrichment → tailored resume PDF → cold email → log → notify → follow-up → close** — discovery/enrichment use **free APIs**; all LLM steps run on **OpenAI** (`gpt-4o-mini`, pay-per-use, fractions of a cent per job).

## Files

| File | What it is |
|---|---|
| `job-application-agent.n8n.json` | **The workflow. Import this into n8n** (Workflows → Import from File). One file, two flows inside: the 12-hourly application pipeline + the daily follow-up engine. |
| `SETUP-GUIDE.md` | **Step-by-step reference:** every node explained, every Config value + where to get it, every sheet column + what writes it. Start here. |
| `scripts/build_workflow.js` | Generates the JSON above. Edit + re-run if you want to change the build. |
| `scripts/fetch_samples.js` | Probes the 6 free job APIs, saves raw responses to `samples/`. |
| `scripts/dry_run.js` | Validates the workflow file + executes its actual Code-node logic against real API samples. `node scripts/dry_run.js` → expect `183 checks passed`. |

## Free substitutions vs the master spec (swap back later)

| Spec said | Test build uses | Cost |
|---|---|---|
| Apify (LinkedIn/Indeed/Rozee/Mustakbil) | RemoteOK + Remotive + Arbeitnow + Jobicy + Himalayas + WeWorkRemotely RSS (all keyless) | Free |
| Claude API | **OpenAI `gpt-4o-mini`** for all 4 LLM steps (score, resume, cold email, follow-up) | ~cents per run |
| Carbone.io PDF | Native Google Drive node (text → Google Doc → export PDF) | Free |
| Hunter.io | Hunter.io free tier (25 domain searches/month) | Free |
| Apollo.io | Optional — leave `APOLLO_API_KEY` empty to skip (free Apollo API returns **no emails**; see SETUP-GUIDE §1.2) | Paid to be useful |
| Web-search discovery layer | Not included yet (needs Tavily/Brave key) — see sticky note in the canvas | — |

## Setup (one time, ~20 minutes)

1. **Google Sheet** — create one, rename the tab to `applications`, paste this into cell A1 (it splits across 28 columns automatically):

   ```
   job_id	job_title	company	matched_track	source	job_url	posted_date	scraped_at	match_score	geo_eligible	geo_reason	seniority_match	matched_keywords	missing_keywords	recruiter_name	recruiter_email	email_confidence	email_source	resume_filename	resume_drive_link	email_subject	applied_at	reply_received	reply_date	followup_sent	followup_date	status	notes
   ```

   Copy the Sheet ID from the URL (`docs.google.com/spreadsheets/d/<THIS PART>/edit`).

2. **Import** `job-application-agent.n8n.json` into n8n.

3. **Config node** (and **Config (Follow-up)** — keep them in sync) — fill in:
   - `SHEET_ID` — from step 1
   - `LLM_API_KEY` — OpenAI key from https://platform.openai.com/api-keys
   - `HUNTER_API_KEY` — free key from https://hunter.io/api-keys
   - `TELEGRAM_CHAT_ID` — message your bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `chat.id`
   - `CANDIDATE_EMAIL`, `CANDIDATE_LINKEDIN` — real values (they go into email signatures)
   - `MASTER_RESUME` — fix the `[FILL ME IN]` placeholders (dates, earlier role, education)
   - `DRIVE_FOLDER_ID` — optional folder for resume docs (blank = My Drive root)

4. **Credentials** (n8n will flag the nodes in red — attach yours). Four total:
   - Google Sheets OAuth → both Sheets read nodes + all `Save/Mark/Log` nodes
   - Gmail OAuth → `Gmail: Send Application`, `Gmail: Send Follow-up`, `Gmail: Recent Inbox`
   - Google Drive OAuth → `Create Resume Doc`, `Export Resume PDF`
   - Telegram (bot token from @BotFather) → all `TG:` nodes

5. **Test**: click `Manual Test` → Execute. Watch jobs flow through. Nothing is emailed — `SEND_EMAILS=false` writes `status=dry_run` rows and sends you 🧪 Telegram previews instead.

## Phase 1 checklist → where it lives

| Checklist item | In the workflow |
|---|---|
| Google Sheet banao — columns set karo | Step 1 above (28-col header) |
| Cron node | `Every 12 Hours` (+ `Daily Follow-up Check` @ 09:00 Asia/Karachi) |
| Scraper HTTP nodes — test run | `Fetch *` nodes (6 free sources instead of Apify) |
| Dedup node | `Hard Filters` (hash + in-batch) → `Read Sheet Log` → `Filter New Jobs` |
| Claude scoring node | `Build Score Prompt` → `LLM: Score Job` → `Parse Score` (exact spec prompt) |
| Test with 10 jobs | `MAX_JOBS_PER_RUN=10` in Config |
| Hunter node + Apollo fallback | `Hunter: Find Email` → `Apollo: Find People` → `Finalize Email` |
| Sheets logging | `Log New Jobs`, `Save Score`, `Save Enrichment`, `Save Resume Link`, `Mark *` |
| Resume + email automation | already wired, gated behind `SEND_EMAILS` |

## Going live

1. Review a few dry-run rows (subjects, resume docs in Drive, match scores).
2. Set `SEND_EMAILS=true` in **both** Config nodes.
3. Activate the workflow (toggle top-right). Both schedule triggers arm.

Full pre-flight + first-live-run checklist: **SETUP-GUIDE.md → Part 4 (Go Live)**.

## Status lifecycle

`new → scored → enriched → applied → followed_up → replied/closed`
Side exits: `geo_blocked`, `low_match`, `score_error`, `manual_apply`, `dry_run` (test mode only).
Follow-up after 5 business days of silence; closed 3 days after the follow-up. Never a third email.

## LLM settings (OpenAI)

Three Config fields drive all four LLM calls (score, resume, cold email, follow-up):

| Field | Value |
|---|---|
| `LLM_API_BASE` | `https://api.openai.com/v1/chat/completions` — leave as is |
| `LLM_MODEL` | `gpt-4o-mini` (default, cheap) · `gpt-4.1-mini` (stronger) · `gpt-5-mini` / `gpt-5` (reasoning) |
| `LLM_API_KEY` | `sk-...` from platform.openai.com/api-keys (requires a small prepaid balance) |

Scoring runs at `temperature: 0` for consistent JSON verdicts; reasoning models (`gpt-5*`, `o*`) reject `temperature`, so the workflow omits it for those automatically.

## Known free-tier limits

- **Hunter 25 searches/month** — one per apply-routed job. At 10 jobs/run it's a few days of testing; quota errors degrade gracefully to the `careers@domain` pattern or `manual_apply`.
- **OpenAI is pay-per-use** — with `gpt-4o-mini` a full run at cap 10 (~30–60 LLM calls) costs a few cents. Calls are throttled to 1 request / 6 s. A $5 prepaid balance covers weeks of testing.
- **48 h lookback** filters aggressively (spec behavior). If a test run finds too few jobs, raise `LOOKBACK_HOURS` to `168`.
- `careers@` pattern emails can bounce — that's expected for a fallback; Hunter-sourced addresses are preferred automatically.

## Re-verify after any edit

```
node scripts/fetch_samples.js   # refresh real API samples
node scripts/build_workflow.js  # regenerate the JSON
node scripts/dry_run.js         # must end: DRY RUN CLEAN ✔
```
