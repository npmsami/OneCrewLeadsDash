-- 0005 — Sent Emails section + human-gated follow-ups.
--
-- Follow-ups were fully automatic: followup.py sent one after 5 business days
-- with no human in the loop. They are now gated the same way first contact is —
-- the engine only DETECTS replies and DRAFTS the follow-up; the user unlocks it
-- after 24h without a reply, edits it, and queues it.

-- ---------------------------------------------------------------------------
-- 1) outreach_queue learns what kind of email it is carrying
-- ---------------------------------------------------------------------------
alter table public.outreach_queue
  add column if not exists kind text not null default 'initial';   -- initial | followup

-- The dup-send guard was one active row per job, which would block a follow-up
-- forever because the initial email stays 'sent'. Scope it per kind instead:
-- one active initial AND one active follow-up per lead.
drop index if exists public.uniq_outreach_active_job;
create unique index if not exists uniq_outreach_active_job_kind
  on public.outreach_queue (job_id, kind)
  where status in ('ready', 'queued', 'sending', 'sent');

-- ---------------------------------------------------------------------------
-- 2) applications hold the editable follow-up draft
-- ---------------------------------------------------------------------------
alter table public.applications
  add column if not exists followup_subject      text,
  add column if not exists followup_body         text,
  add column if not exists followup_generated_at timestamptz;

comment on column public.applications.followup_body is
  'AI-drafted follow-up awaiting human review. Written by the follow-up engine, edited in the Sent Emails screen, then queued as an outreach_queue row with kind=followup.';

-- ---------------------------------------------------------------------------
-- 3) sent_email_stats — header counts for the Sent Emails screen
-- ---------------------------------------------------------------------------
-- "Awaiting reply" and "follow-up ready" both hinge on the 24h rule, so the
-- threshold lives here rather than being re-derived in the UI.
create or replace view public.sent_email_stats as
select
  count(*)                                                                as total_sent,
  count(*) filter (where a.reply_received)                                as replied,
  count(*) filter (where not a.reply_received)                            as awaiting_reply,
  count(*) filter (
    where not a.reply_received
      and not a.followup_sent
      and q.sent_at < now() - interval '24 hours'
  )                                                                       as followup_ready,
  count(*) filter (where a.followup_sent)                                 as followed_up,
  max(q.sent_at)                                                          as last_sent_at
from public.outreach_queue q
join public.applications a on a.job_id = q.job_id
where q.status = 'sent' and q.kind = 'initial';

grant select on public.sent_email_stats to anon, authenticated;
