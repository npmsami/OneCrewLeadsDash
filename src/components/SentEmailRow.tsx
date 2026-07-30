"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enqueueFollowupAction } from "@/app/(dashboard)/job-applications/actions";
import { fmtDateTime } from "@/lib/datetime";
import type { Application, OutreachQueue } from "@/lib/types";

export interface SentEmail {
  queue: OutreachQueue;
  lead: Application;
  followupQueue: OutreachQueue | null;
  /** Evaluated on the SERVER (see the page). Deriving it here from Date.now()
   *  would differ between render and hydration and warp the 24h boundary. */
  canFollowUp: boolean;
  gateMessage: string;
}

const inputClass =
  "w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/25";

// Same shape as StatusBadge, but driven by reply/follow-up state rather than a
// status column (that state is spread across the lead and its queue rows).
function Chip({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tone}`}>
      {label}
    </span>
  );
}

function StateChip({ item, unlocked }: { item: SentEmail; unlocked: boolean }) {
  const { lead, followupQueue } = item;
  if (lead.reply_received) return <Chip label="Replied" tone="bg-ok/15 text-ok ring-ok/25" />;
  if (followupQueue && ["queued", "sending"].includes(followupQueue.status)) {
    return <Chip label="Follow-up queued" tone="bg-accent/15 text-accent-2 ring-accent/25" />;
  }
  if (lead.followup_sent) return <Chip label="Followed up" tone="bg-white/[0.06] text-muted ring-border" />;
  if (unlocked) return <Chip label="No reply · follow up" tone="bg-warn/15 text-warn ring-warn/25" />;
  return <Chip label="Awaiting reply" tone="bg-white/[0.06] text-faint ring-border" />;
}

export function SentEmailRow({ item }: { item: SentEmail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { queue, lead, canFollowUp, gateMessage } = item;

  const [subject, setSubject] = useState(lead.followup_subject ?? `Re: ${queue.subject ?? ""}`);
  const [body, setBody] = useState(lead.followup_body ?? "");

  function send() {
    setMsg(null);
    startTransition(async () => {
      const res = await enqueueFollowupAction(lead.job_id, { to: queue.to_email, subject, body });
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <tr className="transition hover:bg-white/[0.02]">
        <td className="max-w-xs px-5 py-3.5">
          <span className="block truncate font-medium text-fg">{lead.job_title ?? "Untitled role"}</span>
          <span className="block truncate text-xs text-faint">{lead.company ?? "Unknown"}</span>
        </td>
        <td className="max-w-[13rem] px-3 py-3.5">
          <span className="block truncate text-xs text-muted">{queue.to_email}</span>
          {lead.recruiter_name && (
            <span className="block truncate text-[11px] text-faint">{lead.recruiter_name}</span>
          )}
        </td>
        <td className="px-3 py-3.5 text-xs text-faint">{fmtDateTime(queue.sent_at)}</td>
        <td className="px-3 py-3.5"><StateChip item={item} unlocked={canFollowUp} /></td>
        <td className="px-5 py-3.5 text-right">
          <button
            onClick={() => setOpen((v) => !v)}
            disabled={!canFollowUp}
            title={canFollowUp ? "Review and send the follow-up" : gateMessage}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-fg transition hover:bg-white/5 disabled:cursor-not-allowed disabled:border-border-soft disabled:text-faint"
          >
            {open ? "Close" : "Send follow-up"}
          </button>
        </td>
      </tr>

      {open && canFollowUp && (
        <tr>
          <td colSpan={5} className="bg-panel-2/40 px-5 py-4">
            <div className="space-y-3">
              <p className="text-xs text-faint">
                {lead.followup_body
                  ? `AI draft written ${fmtDateTime(lead.followup_generated_at)} — edit anything before sending.`
                  : "No AI draft yet (the follow-up engine writes one on its next run). Write it yourself, or wait."}
              </p>
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Subject</span>
                <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Body</span>
                <textarea
                  className={`${inputClass} min-h-[160px] resize-y leading-relaxed`}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Circling back on my application…"
                />
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={send}
                  disabled={pending || !body.trim()}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
                >
                  {pending ? "Queueing…" : "Queue follow-up"}
                </button>
                <span className="text-xs text-faint">
                  Goes into the same spaced queue. No resume re-attached.
                </span>
              </div>
              {msg && (
                <p className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
