# ▶ CONTINUE HERE — OneCrew Leads Hub

> Handoff note. Read this, then memory `onecrew-leads-hub.md` + `job-application-agent.md`.

## What this is
Premium dashboard (brand **One Crew**) for the Python **job-application agent** (`../job-application-agent/`).
The agent writes leads to Supabase; this dashboard reads them + holds the Candidate Signature config.

## Stack & coordinates
- **Next.js 16** (App Router, Turbopack) + React 19 + **Tailwind v4** + TypeScript, deploy on **Vercel**
- Supabase project_ref `dzhnxsgrnohyswhbjthc`; tables `applications` (+ `application_stats` view) and `settings` (singleton Candidate Signature)
- Env in `.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable), `SUPABASE_SERVICE_ROLE_KEY` (server-only, for settings writes)
- GitHub (push later): https://github.com/npmsami/OneCrewLeadsDash.git

## Built so far (✅ verified: `npm run build` clean, dev server renders real data)
- Theme `src/app/globals.css` (dark, glass, indigo→cyan accent); `src/lib/status.ts` status→chip map
- `src/lib/supabase.ts` (`supabaseRead` anon / `supabaseAdmin` service-role); `src/lib/types.ts`
- `src/components/Sidebar.tsx`, `StatusBadge.tsx`
- Pages: `/` Overview (stat cards + recent activity), `/leads` (full table), `/settings` (Candidate Signature — **read-only for now**)
- Run: `npm run dev` → http://localhost:3000

## Git / deploy
- Pushed to **https://github.com/npmsami/OneCrewLeadsDash** (`main`). Auth: gh account `iamsyedmurtaza-creator` (collaborator). Next app is at repo ROOT.
- **Vercel auto-deploys on push.** Env vars set (4): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable), `SUPABASE_SERVICE_ROLE_KEY` (secret), `DASHBOARD_PASSWORD`.
- **TWO deploy gotchas (both fixed, keep in mind):**
  1. Project `framework` was `null` → Vercel ran `next build` but didn't apply Next.js routing → every route 404'd. Fixed by committing **`vercel.json` `{ "framework": "nextjs" }`** — DO NOT remove it.
  2. Vercel git-author protection blocks deploys whose commit author isn't the connected account. **Commits MUST be authored as `npmsami`** (`209180841+npmsami@users.noreply.github.com`). Repo git config is set to this; keep it. (Author, not pusher — gh pushes as collaborator `iamsyedmurtaza-creator`, fine.)
- Verified live: production alias `/login` returns 200 (One Crew login). Deploys are READY.
- **Vercel team:** "Sami's projects" (`team_4V6fxyHdKFKmlcqCJYjKnnN3`); project `prj_PIdSvFagk21UrSwki8KcGz26PDAt`.
- **Canonical URL:** https://one-crew-leads-dash-samis-projects-e3fc9c86.vercel.app/ (bare `one-crew-leads-dash.vercel.app` 404s — quirk; use team-scoped).
- **Access = app-level password gate** (Next 16 `src/proxy.ts` + `/login`, cookie `oc_auth` = sha256 of password). Env `DASHBOARD_PASSWORD` gates the whole app; if unset, gate is fail-open (dormant). Protected pages live in `src/app/(dashboard)/`; `/login` has its own minimal layout.
- Go-live access steps (user does in Vercel): 1) add env `DASHBOARD_PASSWORD`, 2) Redeploy, 3) Settings → Deployment Protection → Vercel Authentication = Disabled. Then open the canonical URL → app login → password. Local dev password in `.env.local` = `onecrew-dev` (local only).

## Go-live plan + decisions (2026-06-28)
- Sending account: **Google Workspace custom domain** (user setting up domain+Workspace) — for deliverability (DKIM/DMARC, 2k/day). NOT plain gmail.
- Templates: **seeded defaults, user edits** — `settings.email_template` + `followup_template` (DONE; dashboard textareas + agent `email_writer` follows them, GPT fills `[brackets]`, placeholders `{recruiter_name}/{company}/{role}/{signature}`).
- Dedup: **per-role** (no per-company rule). Existing job_id + (title+company) dedup is the no-double-apply guarantee.
- Deliverability: send via Gmail API from the Workspace address; plain-text, personalized, spaced sends, volume ramp.

## Gmail connect (DONE on dashboard side)
- OAuth flow: `/api/google/auth` + `/api/google/callback`. Refresh token in **locked `gmail_auth` table** (RLS deny-all; service-role only). Settings page shows Connect/Reconnect + status.
- Env needed (dashboard + Vercel): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (web client; redirect URIs registered: team-scoped vercel `/api/google/callback` + localhost). Scopes gmail.send + gmail.readonly + email.
- User connects on the live site with the Workspace sending address.

## ▶ NEXT (build order)
1. (DONE) dashboard, password gate, deploy fix, templates, **email quality locked**, follow-up engine, **Gmail connect flow**.
2. **Agent send layer** `agent/google.py`: read refresh token from `gmail_auth` (service role) + `GOOGLE_CLIENT_ID/SECRET` → mint access token → Gmail API send (attach resume from Drive link) + read inbox for follow-up reply detection. Wire into pipeline (gated by settings.send_emails) + followup.py.
3. **Batch send throttle**: ~40 emails over ~20 min (≈30s spacing).
4. **DKIM/DMARC checklist** for the Workspace domain (deliverability).
5. **Expand discovery** (JSearch multi-query) + raise MAX_JOBS_PER_RUN + **GitHub Actions cron**. Solve Hunter 25/mo cap.
6. Flip go-live (settings.send_emails) when ready.

## Working style
Incremental — ONE step per turn, check in between. Dry-run footing (send_emails=false) until the user flips go-live.
