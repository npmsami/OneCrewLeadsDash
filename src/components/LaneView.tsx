import { Suspense } from "react";
import { supabaseRead } from "@/lib/supabase";
import { LeadsFilters } from "@/components/LeadsFilters";
import { LeadsTable } from "@/components/LeadsTable";
import {
  applyLeadFilters, applySourceGroup,
  type QueryLike, type SourceGroup, type LeadFilterParams,
} from "@/lib/leads";
import type { Application, OutreachQueue, Resume, Settings } from "@/lib/types";

const ROW_LIMIT = 500;

interface Props {
  title: string;
  subtitle: string;
  group: SourceGroup;
  lane: "linkedin" | "outreach";
  filters: LeadFilterParams;
  emptyMessage?: string;
}

/**
 * Shared server view behind "LinkedIn Apply" and "Send Emails (Other)". Both
 * lanes read the same table; only the source group, the copy, and which
 * actions are surfaced differ.
 */
export async function LaneView({
  title, subtitle, group, lane, filters, emptyMessage,
}: Props) {
  const sb = supabaseRead();

  const base = sb.from("applications").select("*") as unknown as QueryLike;
  const scoped = applySourceGroup(base, group);
  const query = applyLeadFilters(scoped, filters) as unknown as {
    limit: (n: number) => Promise<{ data: Application[] | null }>;
  };

  const [{ data }, { data: resumeRows }, { data: settingsRows }, { data: queueRows }] =
    await Promise.all([
      query.limit(ROW_LIMIT),
      sb.from("resumes").select("*").order("is_default", { ascending: false }),
      sb.from("settings").select("default_resume_id").eq("id", "singleton").limit(1),
      // Newest-first so the first row we see per job_id is its latest item.
      sb.from("outreach_queue").select("*").order("created_at", { ascending: false }),
    ]);

  const leads = data ?? [];
  const resumes = (resumeRows as Resume[] | undefined) ?? [];
  const defaultResumeId =
    (settingsRows?.[0] as Pick<Settings, "default_resume_id"> | undefined)?.default_resume_id ?? null;

  const queueByJob: Record<string, OutreachQueue> = {};
  for (const q of (queueRows as OutreachQueue[] | undefined) ?? []) {
    if (!queueByJob[q.job_id]) queueByJob[q.job_id] = q;
  }

  const withContact = leads.filter((l) => l.recruiter_email).length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">
            {leads.length}{leads.length === ROW_LIMIT ? "+" : ""} job{leads.length === 1 ? "" : "s"}
            {lane === "outreach" ? ` · ${withContact} with a recruiter email` : ""} · {subtitle}
          </p>
        </div>
      </header>

      <Suspense>
        <LeadsFilters {...filters} />
      </Suspense>

      <LeadsTable
        leads={leads}
        resumes={resumes}
        defaultResumeId={defaultResumeId}
        queueByJob={queueByJob}
        lane={lane}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
