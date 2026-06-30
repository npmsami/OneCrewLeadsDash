-- ============================================================================
-- Website Audit Outreach — Supabase schema (automation #2)
-- Mirrors the n8n "AI Website Audit → Personalized Cold Email (Leads)" workflow,
-- replacing its Google Sheet with Postgres. The Python port reads/writes here.
-- Reuses public.set_updated_at() and public.gmail_auth from the job-app schema.
-- Run in: Supabase Dashboard → SQL Editor (or applied via MCP migration).
-- ============================================================================

-- One row per outreach lead. Natural key = lowercased contact email, mirroring
-- the workflow's "Contact Email" matching column, so re-processing a lead is an
-- idempotent upsert (ON CONFLICT (email)).
create table if not exists public.audit_leads (
  -- identity ------------------------------------------------------------------
  email             text primary key,                  -- lowercased contact email (dedup key)
  first_name        text,
  full_name         text,
  company           text,
  job_title         text,
  phone             text,
  city              text,
  state             text,
  industry          text,
  revenue           text,
  employees         text,
  website           text,                              -- raw URL as provided
  domain            text,                              -- normalized host

  -- AI + email artifacts ------------------------------------------------------
  subject           text,                              -- generated subject line
  ai_business_name  text,                              -- AI-resolved business name
  ai_summary        text,                              -- one-line website summary
  ai_gaps           text,                              -- pipe-joined gap list
  email_html        text,                              -- full generated HTML (dashboard preview)

  -- lifecycle -----------------------------------------------------------------
  --   pending → dry_run (drafted, hold) → sent
  --   side exits: skipped (no site content), send_error
  status            text not null default 'pending',
  skip_reason       text,
  error             text,
  sent_at           timestamptz,

  -- bookkeeping ---------------------------------------------------------------
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_audit_leads_updated_at on public.audit_leads;
create trigger trg_audit_leads_updated_at
  before update on public.audit_leads
  for each row execute function public.set_updated_at();

create index if not exists idx_audit_leads_status     on public.audit_leads (status);
create index if not exists idx_audit_leads_created_at on public.audit_leads (created_at desc);
create index if not exists idx_audit_leads_sent_at    on public.audit_leads (sent_at desc);
create index if not exists idx_audit_leads_company    on public.audit_leads (company);

-- ============================================================================
-- Per-automation settings (singleton). The sender's branding + the go-live
-- toggle, edited from the dashboard and read by the agent at runtime.
-- The actual sending account is the connected Gmail in public.gmail_auth
-- (shared with the job-app automation); sender_email here is display-only.
-- ============================================================================
create table if not exists public.audit_settings (
  id              text primary key default 'singleton',
  agency_name     text,
  tagline         text,
  sender_name     text,
  sender_title    text,
  sender_email    text,                  -- shown in the signature (display only)
  sender_phone    text,
  sender_address  text,                  -- CAN-SPAM postal address
  unsubscribe_url text,
  calendar_link   text,
  website_url     text,
  hero_url        text,                  -- banner image URL
  logo_url        text,                  -- white logo for dark header (optional)
  sign_img_url    text,                  -- signature headshot (optional)
  daily_send_cap  smallint not null default 40,
  send_emails     boolean  not null default false,
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_audit_settings_updated_at on public.audit_settings;
create trigger trg_audit_settings_updated_at
  before update on public.audit_settings
  for each row execute function public.set_updated_at();

-- Seed the singleton with OneCrew's real branding defaults (config, not leads).
-- Placeholder-only fields (phone, postal address) are left blank for the user.
insert into public.audit_settings (
  id, agency_name, tagline, sender_name, sender_title, sender_email,
  unsubscribe_url, calendar_link, website_url, hero_url, send_emails
) values (
  'singleton',
  'OneCrew Technologies',
  'We ship. You scale.',
  'Sami',
  'OneCrew Technologies',
  'support@onecrewtech.com',
  'https://www.onecrewtech.com/unsubscribe',
  'https://cal.com/onecrewtech/30min',
  'https://www.onecrewtech.com',
  -- direct-image host (dl.dropboxusercontent.com) so it renders in email clients;
  -- the www.dropbox.com/...?raw=1 share form serves an HTML page, not the image.
  'https://dl.dropboxusercontent.com/scl/fi/9d76140rf574kiewepnb4/Picsart_26-06-15_03-41-30-746.jpg.jpeg?rlkey=0zkyusjr762eqakk0n22jqzjn&raw=1',
  false
)
on conflict (id) do nothing;

-- ============================================================================
-- Row Level Security — same posture as the applications table:
-- agent writes with the SERVICE ROLE key (bypasses RLS); dashboard reads ANON.
-- ============================================================================
alter table public.audit_leads    enable row level security;
alter table public.audit_settings enable row level security;

drop policy if exists "read audit_leads" on public.audit_leads;
create policy "read audit_leads" on public.audit_leads for select using (true);

drop policy if exists "read audit_settings" on public.audit_settings;
create policy "read audit_settings" on public.audit_settings for select using (true);

-- ============================================================================
-- Stats view for the automation's Overview header (one-query read).
-- ============================================================================
create or replace view public.audit_lead_stats as
select
  count(*)                                       as total,
  count(*) filter (where status = 'pending')     as pending,
  count(*) filter (where status = 'dry_run')     as dry_run,
  count(*) filter (where status = 'sent')        as sent,
  count(*) filter (where status = 'skipped')     as skipped,
  count(*) filter (where status = 'send_error')  as send_error,
  max(sent_at)                                   as last_sent_at,
  max(created_at)                                as last_added_at
from public.audit_leads;
