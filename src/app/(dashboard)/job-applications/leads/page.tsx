import { Suspense } from "react";
import { supabaseRead } from "@/lib/supabase";
import { LeadRow } from "@/components/LeadRow";
import { LeadsFilters } from "@/components/LeadsFilters";
import { ACTIVE_STATUSES } from "@/lib/status";
import type { Application } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROW_LIMIT = 500;

interface SearchParams {
  q?: string;
  status?: string;
  source?: string;
  score?: string;
  sort?: string;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.status ?? "all";
  const source = sp.source ?? "all";
  const score = sp.score ?? "";
  const sort = sp.sort ?? "score";

  const sb = supabaseRead();
  let query = sb.from("applications").select("*");

  if (q) {
    const safe = q.replace(/[,()%*]/g, " ").trim();
    if (safe) query = query.or(`job_title.ilike.%${safe}%,company.ilike.%${safe}%`);
  }
  if (status === "active") query = query.in("status", ACTIVE_STATUSES);
  else if (status !== "all") query = query.eq("status", status);
  if (source !== "all") query = query.eq("source", source);
  const minScore = Number(score);
  if (minScore > 0) query = query.gte("match_score", minScore);

  if (sort === "posted") query = query.order("posted_date", { ascending: false, nullsFirst: false });
  else if (sort === "updated") query = query.order("updated_at", { ascending: false });
  else query = query.order("match_score", { ascending: false, nullsFirst: false });

  const { data } = await query.limit(ROW_LIMIT);
  const leads = (data as Application[] | undefined) ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="mt-1 text-sm text-muted">
          {leads.length}{leads.length === ROW_LIMIT ? "+" : ""} job{leads.length === 1 ? "" : "s"} matching your filters.
        </p>
      </header>

      <Suspense>
        <LeadsFilters q={q} status={status} source={source} score={score} sort={sort} />
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
