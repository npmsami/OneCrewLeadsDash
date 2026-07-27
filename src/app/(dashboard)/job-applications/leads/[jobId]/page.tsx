import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseRead } from "@/lib/supabase";
import { StatusBadge } from "@/components/StatusBadge";
import { LeadReview } from "@/components/LeadReview";
import { appStatusMeta } from "@/lib/status";
import type { Application, OutreachQueue, Resume, Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-faint">{label}</dt>
      <dd className={`mt-0.5 text-sm text-fg ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</dd>
    </div>
  );
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const id = decodeURIComponent(jobId);
  const sb = supabaseRead();

  const [{ data: appRows }, { data: queueRows }, { data: resumeRows }, { data: settingsRows }] = await Promise.all([
    sb.from("applications").select("*").eq("job_id", id).limit(1),
    sb.from("outreach_queue").select("*").eq("job_id", id).order("created_at", { ascending: false }),
    sb.from("resumes").select("*").order("is_default", { ascending: false }).order("uploaded_at", { ascending: false }),
    sb.from("settings").select("default_resume_id").eq("id", "singleton").limit(1),
  ]);

  const lead = (appRows?.[0] as Application | undefined) ?? null;
  if (!lead) notFound();

  const queue = (queueRows as OutreachQueue[] | undefined) ?? [];
  const latest = queue[0] ?? null;
  const resumes = (resumeRows as Resume[] | undefined) ?? [];
  const defaultResumeId =
    (settingsRows?.[0] as Pick<Settings, "default_resume_id"> | undefined)?.default_resume_id ?? null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 md:px-10">
      <Link href="/job-applications/leads" className="text-sm text-muted transition hover:text-fg">
        ← Back to leads
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{lead.job_title ?? "Untitled role"}</h1>
          <p className="mt-1 truncate text-sm text-muted">
            {lead.company ?? "Unknown"} · {lead.source ?? "—"}
            {lead.matched_track ? ` · ${lead.matched_track}` : ""}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <StatusBadge status={lead.app_status ?? "remaining"} meta={appStatusMeta(lead.app_status ?? "remaining")} />
            {lead.match_score != null && (
              <span className="text-xs text-muted">Score <span className="tabular-nums text-fg">{lead.match_score}</span></span>
            )}
            {lead.qualified === false && <span className="text-xs text-faint">unqualified</span>}
          </div>
        </div>
        {lead.job_url && (
          <a
            href={lead.job_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-border-soft px-3 py-2 text-sm font-medium text-accent-2 transition hover:bg-white/5"
          >
            Open job posting ↗
          </a>
        )}
      </header>

      {/* Who this email goes to — the thing to sanity-check before sending. */}
      <section className="card mt-6 p-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">Contact</h2>
          {lead.email_source && (
            <span className="text-xs text-faint">
              via {lead.email_source}
              {lead.email_confidence ? ` · ${lead.email_confidence} confidence` : ""}
            </span>
          )}
        </div>
        {lead.recruiter_email ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-medium text-fg">{lead.recruiter_name || "Hiring Team"}</span>
            {lead.recruiter_title && <span className="text-xs text-muted">{lead.recruiter_title}</span>}
            <span className="w-full font-mono text-xs text-accent-2">{lead.recruiter_email}</span>
            {lead.company_domain && <span className="text-xs text-faint">{lead.company_domain}</span>}
          </div>
        ) : (
          <p className="text-sm text-muted">
            No contact found yet
            {lead.enriched_at
              ? ` — last checked ${fmtDateTime(lead.enriched_at)}.`
              : " — queued for the next automatic lookup."}{" "}
            Lookups run automatically after each scrape and every 6 hours, best match score
            first. You can also type a recipient in below and apply anyway.
          </p>
        )}
      </section>

      {/* Editable email review + Apply + status controls (client) */}
      <LeadReview
        jobId={lead.job_id}
        appStatus={lead.app_status ?? "remaining"}
        defaultTo={lead.recruiter_email ?? ""}
        defaultSubject={lead.email_subject ?? ""}
        defaultBody={lead.email_body ?? ""}
        resumes={resumes}
        defaultResumeId={defaultResumeId}
        latestQueue={latest}
      />

      {/* Scoring / contact / meta (read-only) */}
      <section className="card mt-6 grid grid-cols-2 gap-4 p-5">
        <Field label="Seniority" value={lead.seniority_match} />
        <Field label="Geo eligible" value={lead.geo_eligible == null ? "—" : lead.geo_eligible ? "Yes" : "No"} />
        <div className="col-span-2"><Field label="Geo reason" value={lead.geo_reason} /></div>
        <div className="col-span-2"><Field label="Matched keywords" value={lead.matched_keywords} /></div>
        <div className="col-span-2"><Field label="Missing keywords" value={lead.missing_keywords} /></div>
        <Field label="Publisher" value={lead.publisher} />
        <Field label="Posted" value={fmtDateTime(lead.posted_date)} />
        <Field label="Scraped" value={fmtDateTime(lead.scraped_at)} />
        <Field label="Enriched" value={fmtDateTime(lead.enriched_at)} />
        <Field label="Applied" value={fmtDateTime(lead.applied_at)} />
        <Field label="Updated" value={fmtDateTime(lead.updated_at)} />
        {lead.notes && <div className="col-span-2"><Field label="Notes" value={lead.notes} /></div>}
      </section>

      {/* The text the email was grounded in — collapsed, it's long. */}
      {lead.job_description && (
        <details className="card mt-6 p-5">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-faint">
            Job description
            <span className="ml-2 font-normal normal-case tracking-normal text-faint">
              (what the email was written from)
            </span>
          </summary>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted">
            {lead.job_description}
          </p>
        </details>
      )}
    </div>
  );
}
