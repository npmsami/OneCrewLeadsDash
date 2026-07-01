-- ============================================================================
-- OneCrew Leads Hub — Supabase schema
-- Mirrors the n8n "applications" Google Sheet (28 cols) as a proper Postgres table.
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run.
-- ============================================================================

-- One table holds every job the agent discovers, scores, enriches, and applies to.
-- Primary key = job_id (the dedup hash the n8n "Hard Filters" node produces),
-- so re-writing the same job is an idempotent upsert (ON CONFLICT (job_id)).
create table if not exists public.applications (
  -- identity / source ---------------------------------------------------------
  job_id            text primary key,                 -- dedup hash from n8n
  job_title         text,
  company           text,
  matched_track     text,                             -- e.g. "devops_cloud" / "ai_data"
  source            text,                             -- remoteok | remotive | jsearch | ...
  job_url           text,
  posted_date       timestamptz,
  scraped_at        timestamptz,

  -- scoring (LLM) -------------------------------------------------------------
  match_score       smallint check (match_score between 0 and 100),
  geo_eligible      boolean,
  geo_reason        text,
  seniority_match   text,
  matched_keywords  text,                             -- comma-joined list (as written by n8n)
  missing_keywords  text,

  -- enrichment (recruiter email) ----------------------------------------------
  recruiter_name    text,
  recruiter_email   text,
  email_confidence  text,                             -- high | medium | low
  email_source      text,                             -- hunter | apollo | pattern

  -- application artifacts -----------------------------------------------------
  resume_filename   text,
  resume_drive_link text,
  email_subject     text,
  email_body        text,                             -- full drafted email (shown in the dashboard detail view)

  -- lifecycle -----------------------------------------------------------------
  applied_at        timestamptz,
  reply_received    boolean not null default false,
  reply_date        timestamptz,
  followup_sent     boolean not null default false,
  followup_date     timestamptz,
  -- status lifecycle:
  --   new → scored → enriched → applied → followed_up → replied/closed
  --   side exits: geo_blocked, low_match, score_error, manual_apply, dry_run
  status            text not null default 'new',
  notes             text,

  -- bookkeeping (managed by Postgres, not the sheet) --------------------------
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- keep updated_at fresh on every write --------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_applications_updated_at on public.applications;
create trigger trg_applications_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- indexes the dashboard will actually use ------------------------------------
create index if not exists idx_applications_status      on public.applications (status);
create index if not exists idx_applications_score       on public.applications (match_score desc);
create index if not exists idx_applications_applied_at  on public.applications (applied_at desc);
create index if not exists idx_applications_scraped_at  on public.applications (scraped_at desc);
create index if not exists idx_applications_company     on public.applications (company);

-- ============================================================================
-- Row Level Security
-- n8n writes with the SERVICE ROLE key (bypasses RLS).
-- The dashboard reads with the ANON key on the server side.
-- For a private internal tool we allow read; lock this down later with auth.
-- ============================================================================
alter table public.applications enable row level security;

drop policy if exists "read applications" on public.applications;
create policy "read applications"
  on public.applications
  for select
  using (true);

-- ============================================================================
-- Optional: a stats view the dashboard header can read in one query.
-- ============================================================================
create or replace view public.application_stats as
select
  count(*)                                              as total,
  count(*) filter (where status = 'applied')           as applied,
  count(*) filter (where status = 'followed_up')       as followed_up,
  count(*) filter (where reply_received)               as replied,
  count(*) filter (where status = 'dry_run')           as dry_run,
  count(*) filter (where status in ('geo_blocked','low_match','score_error','manual_apply')) as filtered_out,
  round(avg(match_score) filter (where match_score is not null))::int as avg_score,
  max(scraped_at)                                       as last_scraped_at,
  max(applied_at)                                       as last_applied_at
from public.applications;
