import { Suspense } from "react";
import { supabaseRead } from "@/lib/supabase";
import { LeadRow } from "@/components/LeadRow";
import { LeadsFilters } from "@/components/LeadsFilters";
import { parseLeadFilters, applyLeadFilters, type QueryLike } from "@/lib/leads";
import type { Application, ApplicationStats } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROW_LIMIT = 500;

type SearchParams = Record<string, string | undefined>;

const COUNT_TABS: { key: keyof ApplicationStats; label: string }[] = [
  { key: "remaining", label: "Remaining" },
  { key: "queued", label: "Queued" },
  { key: "app_applied", label: "Applied" },
  { key: "done", label: "Done" },
  { key: "failed", label: "Failed" },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filters = parseLeadFilters(sp);

  const sb = supabaseRead();
  const base = sb.from("applications").select("*") as unknown as QueryLike;
  const query = applyLeadFilters(base, filters) as unknown as {
    limit: (n: number) => Promise<{ data: Application[] | null }>;
  };

  const [{ data }, { data: statsRows }] = await Promise.all([
    query.limit(ROW_LIMIT),
    sb.from("application_stats").select("*").limit(1),
  ]);
  const leads = data ?? [];
  const stats = (statsRows?.[0] as ApplicationStats | undefined) ?? null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="mt-1 text-sm text-muted">
          {leads.length}{leads.length === ROW_LIMIT ? "+" : ""} job{leads.length === 1 ? "" : "s"} matching your filters.
        </p>
      </header>

      {/* Clear per-status counts */}
      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {COUNT_TABS.map((t) => (
            <div key={t.key} className="card px-4 py-3">
              <div className="text-2xl font-semibold tabular-nums text-fg">{Number(stats[t.key] ?? 0)}</div>
              <div className="text-xs text-faint">{t.label}</div>
            </div>
          ))}
        </div>
      )}

      <Suspense>
        <LeadsFilters {...filters} />
      </Suspense>

      <div className="card mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-3 py-3 font-medium">Track</th>
                <th className="px-3 py-3 text-right font-medium">Score</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 text-right font-medium">Posted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {leads.map((l) => (
                <LeadRow key={l.job_id} lead={l} />
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-faint">
                    No leads match these filters.
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
