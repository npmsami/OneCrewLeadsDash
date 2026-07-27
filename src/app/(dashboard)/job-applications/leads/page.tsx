import { Suspense } from "react";
import { supabaseRead } from "@/lib/supabase";
import { LeadsFilters } from "@/components/LeadsFilters";
import { LeadsTable } from "@/components/LeadsTable";
import { parseLeadFilters, applyLeadFilters, type QueryLike } from "@/lib/leads";
import type {
  Application, ApplicationStats, OutreachQueue, Resume, Settings,
} from "@/lib/types";

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

// Every source in one table. The two focused lanes live at
// /job-applications/linkedin and /job-applications/outreach.
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

  const [{ data }, { data: statsRows }, { data: resumeRows }, { data: settingsRows }, { data: queueRows }] =
    await Promise.all([
      query.limit(ROW_LIMIT),
      sb.from("application_stats").select("*").limit(1),
      sb.from("resumes").select("*").order("is_default", { ascending: false }),
      sb.from("settings").select("default_resume_id").eq("id", "singleton").limit(1),
      sb.from("outreach_queue").select("*").order("created_at", { ascending: false }),
    ]);

  const leads = data ?? [];
  const stats = (statsRows?.[0] as ApplicationStats | undefined) ?? null;
  const resumes = (resumeRows as Resume[] | undefined) ?? [];
  const defaultResumeId =
    (settingsRows?.[0] as Pick<Settings, "default_resume_id"> | undefined)?.default_resume_id ?? null;

  const queueByJob: Record<string, OutreachQueue> = {};
  for (const q of (queueRows as OutreachQueue[] | undefined) ?? []) {
    if (!queueByJob[q.job_id]) queueByJob[q.job_id] = q;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">All Leads</h1>
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

      <LeadsTable
        leads={leads}
        resumes={resumes}
        defaultResumeId={defaultResumeId}
        queueByJob={queueByJob}
        lane="outreach"
      />
    </div>
  );
}
