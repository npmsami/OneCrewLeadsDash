import Link from "next/link";
import { supabaseRead } from "@/lib/supabase";
import { StatusBadge } from "@/components/StatusBadge";
import { ScrapeButton } from "@/components/ScrapeButton";
import { FindEmailsButton } from "@/components/FindEmailsButton";
import { appStatusMeta } from "@/lib/status";
import type { Application, ApplicationStats, ScrapeRun } from "@/lib/types";

export const dynamic = "force-dynamic";

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default async function OverviewPage() {
  const sb = supabaseRead();
  const [{ data: statsRows }, { data: recent }, { data: runRows }, withEmail, needEmail] =
    await Promise.all([
      sb.from("application_stats").select("*").limit(1),
      // Recent activity: SAME score-based sort as the Leads page default.
      sb.from("applications").select("*").order("match_score", { ascending: false, nullsFirst: false }).limit(8),
      sb.from("scrape_runs").select("*").order("finished_at", { ascending: false }).limit(1),
      // Email coverage: of the leads still awaiting a decision, how many have a
      // recipient to send to vs. how many are still blocked on enrichment.
      sb.from("applications").select("job_id", { count: "exact", head: true })
        .eq("app_status", "remaining").not("recruiter_email", "is", null),
      sb.from("applications").select("job_id", { count: "exact", head: true })
        .eq("app_status", "remaining").eq("status", "manual_apply").is("recruiter_email", null),
    ]);

  const stats = (statsRows?.[0] as ApplicationStats | undefined) ?? null;
  const leads = (recent as Application[] | undefined) ?? [];
  const lastRun = (runRows?.[0] as ScrapeRun | undefined) ?? null;
  const readyToSend = withEmail.count ?? 0;
  const awaitingEmail = needEmail.count ?? 0;

  const cards = [
    { label: "Total leads", value: stats?.total ?? 0, hint: "discovered & scored" },
    { label: "Qualified", value: stats?.qualified ?? 0, hint: "passed score + geo", accent: true },
    { label: "Ready to send", value: readyToSend, hint: "have a recruiter email", accent: true },
    { label: "Awaiting email", value: awaitingEmail, hint: "no contact found yet" },
    { label: "Queued", value: stats?.queued ?? 0, hint: "in the send queue" },
    { label: "Applied", value: stats?.app_applied ?? 0, hint: "emails sent / marked" },
  ];

  const runStats = lastRun
    ? [
        { label: "Scraped at", value: fmtDateTime(lastRun.finished_at) },
        { label: "Total scraped", value: lastRun.total_scraped },
        { label: "Qualified", value: lastRun.qualified },
        { label: "Unqualified", value: lastRun.unqualified },
        { label: "Duplicates / skipped", value: lastRun.duplicates_skipped },
      ]
    : [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted">
            Last scrape {timeAgo(stats?.last_scraped_at ?? null)} · Apify + JSearch + Himalayas · outreach sends spaced
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/job-applications/leads" className="text-sm font-medium text-muted transition hover:text-fg">
            View all leads →
          </Link>
          <FindEmailsButton
            hint={
              awaitingEmail > 0
                ? `${awaitingEmail} lead${awaitingEmail === 1 ? "" : "s"} still need a contact`
                : "Hunter → Apollo, best-scoring first"
            }
          />
          <ScrapeButton />
        </div>
      </header>

      {/* Latest scrape result */}
      <section className="card mb-6 p-5">
        <div className="mb-3 text-sm font-semibold text-muted">Latest scrape</div>
        {lastRun ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {runStats.map((s) => (
              <div key={s.label}>
                <div className="text-lg font-semibold tabular-nums text-fg">{s.value}</div>
                <div className="mt-0.5 text-xs text-faint">{s.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-faint">No scrape has run yet. Click “Scrape leads” to populate.</p>
        )}
      </section>

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
        </div>
        <div className="card overflow-hidden">
          {leads.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-faint">
              No leads yet. Run the agent pipeline to populate.
            </div>
          ) : (
            <ul className="divide-y divide-border-soft">
              {leads.map((l) => (
                <li key={l.job_id}>
                  <Link
                    href={`/job-applications/leads/${encodeURIComponent(l.job_id)}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-white/[0.03]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-fg">{l.job_title ?? "Untitled role"}</div>
                      <div className="truncate text-xs text-faint">
                        {l.company ?? "Unknown"} · {l.source ?? "—"}
                        {l.matched_track ? ` · ${l.matched_track}` : ""}
                      </div>
                    </div>
                    {l.match_score != null && (
                      <div className="hidden w-12 text-right text-sm tabular-nums text-muted sm:block">
                        {l.match_score}
                      </div>
                    )}
                    <StatusBadge status={l.app_status ?? "remaining"} meta={appStatusMeta(l.app_status ?? "remaining")} />
                    <div className="hidden w-16 text-right text-xs text-faint md:block">{timeAgo(l.updated_at)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
