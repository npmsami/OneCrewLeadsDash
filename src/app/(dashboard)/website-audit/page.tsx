import Link from "next/link";
import { supabaseRead, supabaseAdmin } from "@/lib/supabase";
import { RunOutreachButton } from "@/components/RunOutreachButton";
import { timeAgo } from "@/lib/datetime";
import { AUDIT_COOLDOWN_MS, AUDIT_STATUS_META, type AuditStats, type AuditLead } from "@/lib/audit";

export const dynamic = "force-dynamic";

export default async function AuditOverview() {
  const sb = supabaseRead();
  const admin = supabaseAdmin();
  const [{ data: statsRows }, { data: settings }, { data: gmail }, { data: recent }] = await Promise.all([
    sb.from("audit_lead_stats").select("*").limit(1),
    admin.from("audit_settings").select("send_emails,daily_send_cap,last_run_at").eq("id", "singleton").maybeSingle(),
    admin.from("gmail_auth").select("refresh_token").eq("id", "singleton").maybeSingle(),
    sb.from("audit_leads").select("*").order("updated_at", { ascending: false }).limit(8),
  ]);

  const stats = (statsRows?.[0] as AuditStats | undefined) ?? null;
  const leads = (recent as AuditLead[] | undefined) ?? [];
  const sendEmails = Boolean(settings?.send_emails);
  const gmailReady = Boolean((gmail as { refresh_token?: string } | null)?.refresh_token);
  const sending = sendEmails && gmailReady;
  const batch = Number(settings?.daily_send_cap ?? 45);
  const lastRunAt = (settings as { last_run_at?: string } | null)?.last_run_at ?? null;
  const lockedUntil = lastRunAt
    ? new Date(new Date(lastRunAt).getTime() + AUDIT_COOLDOWN_MS).toISOString()
    : null;

  const cards = [
    { label: "Total leads", value: stats?.total ?? 0, hint: "imported" },
    { label: "Pending", value: stats?.pending ?? 0, hint: "queued to send", accent: true },
    { label: "Sent", value: stats?.sent ?? 0, hint: "emails delivered" },
    { label: "Drafted", value: stats?.dry_run ?? 0, hint: "dry-run drafts" },
    { label: "Skipped", value: stats?.skipped ?? 0, hint: "no site content" },
    { label: "Errors", value: stats?.send_error ?? 0, hint: "send failures" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Website Audit Outreach</h1>
          <p className="mt-1 text-sm text-muted">
            Personalized HTML cold emails · import leads, then send in spaced batches.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/website-audit/leads" className="text-sm font-medium text-muted transition hover:text-fg">
            Import / view leads →
          </Link>
          <RunOutreachButton
            lockedUntil={lockedUntil}
            pendingCount={stats?.pending ?? 0}
            batchSize={batch}
            sending={sending}
          />
        </div>
      </header>

      {/* send-state banner */}
      <div
        className={`mb-8 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
          sending
            ? "border-ok/25 bg-ok/5 text-ok"
            : "border-amber-500/25 bg-amber-500/5 text-amber-300"
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${sending ? "bg-ok" : "bg-amber-400"}`} />
        {sending ? (
          <span>Live sending is ON — runs email real recipients.</span>
        ) : !gmailReady ? (
          <span>Gmail isn&apos;t connected. Connect it in <Link href="/website-audit/settings" className="underline">Settings</Link> before going live.</span>
        ) : (
          <span>Dry-run mode — runs only draft emails. Flip <Link href="/website-audit/settings" className="underline">Live sending</Link> on when ready.</span>
        )}
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="card p-5">
            <div className="text-[13px] font-medium text-muted">{c.label}</div>
            <div className={`mt-2 text-3xl font-semibold tracking-tight ${c.accent ? "text-accent-2" : "text-fg"}`}>
              {c.value}
            </div>
            <div className="mt-1 text-xs text-faint">{c.hint}</div>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">Recent activity</h2>
          {stats?.last_sent_at && (
            <span className="text-xs text-faint">last sent {timeAgo(stats.last_sent_at)}</span>
          )}
        </div>
        <div className="card overflow-hidden">
          {leads.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-faint">
              No leads yet. <Link href="/website-audit/leads" className="text-accent-2 hover:underline">Import a CSV</Link> to begin.
            </div>
          ) : (
            <ul className="divide-y divide-border-soft">
              {leads.map((l) => {
                const meta = AUDIT_STATUS_META[l.status] ?? AUDIT_STATUS_META.pending;
                return (
                  <li key={l.email} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-fg">{l.company || l.ai_business_name || l.email}</div>
                      <div className="truncate text-xs text-faint">{l.email}{l.domain ? ` · ${l.domain}` : ""}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${meta.cls}`}>{meta.label}</span>
                    <div className="hidden w-16 text-right text-xs text-faint md:block">{timeAgo(l.updated_at)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
