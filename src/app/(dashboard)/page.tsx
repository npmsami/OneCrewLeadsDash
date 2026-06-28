import Link from "next/link";
import { supabaseRead } from "@/lib/supabase";
import { StatusBadge } from "@/components/StatusBadge";
import type { Application, ApplicationStats } from "@/lib/types";

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

export default async function OverviewPage() {
  const sb = supabaseRead();
  const [{ data: statsRows }, { data: recent }] = await Promise.all([
    sb.from("application_stats").select("*").limit(1),
    sb.from("applications").select("*").order("updated_at", { ascending: false }).limit(8),
  ]);

  const stats = (statsRows?.[0] as ApplicationStats | undefined) ?? null;
  const leads = (recent as Application[] | undefined) ?? [];

  const cards = [
    { label: "Total leads", value: stats?.total ?? 0, hint: "discovered & scored" },
    { label: "Would apply", value: stats?.dry_run ?? 0, hint: "drafts ready (dry-run)", accent: true },
    { label: "Applied", value: stats?.applied ?? 0, hint: "emails sent" },
    { label: "Replies", value: stats?.replied ?? 0, hint: "recruiter responses" },
    { label: "Avg match", value: stats?.avg_score != null ? `${stats.avg_score}` : "—", hint: "score / 100" },
    { label: "Filtered out", value: stats?.filtered_out ?? 0, hint: "geo / low match / error" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted">
            Last scrape {timeAgo(stats?.last_scraped_at ?? null)} · pipeline runs every 12h
          </p>
        </div>
        <Link
          href="/leads"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90"
        >
          View all leads →
        </Link>
      </header>

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
                <li key={l.job_id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02]">
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
                  <StatusBadge status={l.status} />
                  <div className="hidden w-16 text-right text-xs text-faint md:block">{timeAgo(l.updated_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
