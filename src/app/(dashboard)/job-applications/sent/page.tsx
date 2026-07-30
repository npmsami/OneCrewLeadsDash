import { supabaseRead } from "@/lib/supabase";
import { SentEmailRow, type SentEmail } from "@/components/SentEmailRow";
import { followupUnlocked } from "@/lib/outreach";
import { fmtDateTime } from "@/lib/datetime";
import type { Application, OutreachQueue, SentEmailStats } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Build one display row per INITIAL email, with its follow-up (if any) and the
 * 24h gate already resolved.
 *
 * Lives outside the component on purpose: the gate needs the current time, and
 * evaluating that during render would differ between the server pass and
 * hydration, letting the button flip across the 24h boundary. The server action
 * re-checks the same rule regardless.
 */
function buildSentEmails(
  queue: OutreachQueue[],
  leadsById: Map<string, Application>,
  followupByJob: Map<string, OutreachQueue>,
): SentEmail[] {
  const now = Date.now();
  const out: SentEmail[] = [];
  for (const q of queue) {
    if (q.kind === "followup") continue;
    const lead = leadsById.get(q.job_id);
    if (!lead) continue;
    const followupQueue = followupByJob.get(q.job_id) ?? null;
    const gate = followupUnlocked(
      { sentAt: q.sent_at, replyReceived: lead.reply_received, followupSent: lead.followup_sent },
      now,
    );
    const alreadyQueued = Boolean(
      followupQueue && ["queued", "sending", "sent"].includes(followupQueue.status),
    );
    out.push({
      queue: q, lead, followupQueue,
      canFollowUp: gate.ok && !alreadyQueued,
      gateMessage: alreadyQueued ? "A follow-up is already queued or sent." : gate.message,
    });
  }
  return out;
}

/**
 * Sent Emails — what actually went out, whether it got a reply, and the
 * follow-up control. A follow-up unlocks 24h after sending if nobody replied;
 * the AI draft is written by the follow-up engine and edited here before it is
 * queued (it is never sent automatically).
 */
export default async function SentEmailsPage() {
  const sb = supabaseRead();

  const [{ data: statsRows }, { data: queueRows }] = await Promise.all([
    sb.from("sent_email_stats").select("*").limit(1),
    sb.from("outreach_queue")
      .select("*")
      .in("status", ["sent", "sending", "failed"])
      .order("sent_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  const stats = (statsRows?.[0] as SentEmailStats | undefined) ?? null;
  const queue = (queueRows as OutreachQueue[] | undefined) ?? [];

  // Pull just the leads these emails belong to.
  const jobIds = Array.from(new Set(queue.map((q) => q.job_id)));
  const { data: leadRows } = jobIds.length
    ? await sb.from("applications").select("*").in("job_id", jobIds)
    : { data: [] as Application[] };
  const leadsById = new Map((leadRows as Application[] | undefined ?? []).map((l) => [l.job_id, l]));

  // One display row per INITIAL email; its follow-up (if any) rides along.
  const followupByJob = new Map<string, OutreachQueue>();
  for (const q of queue) if (q.kind === "followup") followupByJob.set(q.job_id, q);

  const items = buildSentEmails(queue, leadsById, followupByJob);

  const cards = [
    { label: "Sent", value: stats?.total_sent ?? 0, hint: "first-contact emails" },
    { label: "Replied", value: stats?.replied ?? 0, hint: "recruiter wrote back", accent: true },
    { label: "Awaiting reply", value: stats?.awaiting_reply ?? 0, hint: "no response yet" },
    { label: "Follow-up ready", value: stats?.followup_ready ?? 0, hint: "24h+ with no reply", accent: true },
    { label: "Followed up", value: stats?.followed_up ?? 0, hint: "second email sent" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sent Emails</h1>
        <p className="mt-1 text-sm text-muted">
          {items.length} email{items.length === 1 ? "" : "s"} sent
          {stats?.last_sent_at ? ` · last ${fmtDateTime(stats.last_sent_at)}` : ""} · follow-ups unlock
          24h after sending, and are never sent without you.
        </p>
      </header>

      <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="card px-4 py-3">
            <div className={`text-2xl font-semibold tabular-nums ${c.accent ? "text-accent-2" : "text-fg"}`}>
              {c.value}
            </div>
            <div className="text-xs text-faint">{c.label}</div>
            <div className="mt-0.5 text-[11px] text-faint/70">{c.hint}</div>
          </div>
        ))}
      </section>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-3 py-3 font-medium">Sent to</th>
                <th className="px-3 py-3 font-medium">Sent</th>
                <th className="px-3 py-3 font-medium">Reply</th>
                <th className="px-5 py-3 text-right font-medium">Follow-up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {items.map((item) => (
                <SentEmailRow key={item.queue.id} item={item} />
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-faint">
                    No emails sent yet. Queue one from Send Emails (Other), and it appears here
                    once the worker sends it.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
