"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "./StatusBadge";
import { LeadReview } from "./LeadReview";
import { appStatusMeta } from "@/lib/status";
import { setAppStatusAction } from "@/app/(dashboard)/job-applications/actions";
import { APP_STATUSES, type Application, type OutreachQueue, type Resume } from "@/lib/types";

interface Props {
  lead: Application;
  resumes: Resume[];
  defaultResumeId: string | null;
  latestQueue: OutreachQueue | null;
  /** "linkedin" hides the email composer by default — those are applied by hand. */
  lane: "linkedin" | "outreach";
  onClose: () => void;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-faint">{label}</dt>
      <dd className="mt-0.5 text-sm text-fg">{value || "—"}</dd>
    </div>
  );
}

export function LeadDrawer({ lead, resumes, defaultResumeId, latestQueue, lane, onClose }: Props) {
  // Escape closes; lock body scroll while the overlay is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const hasContact = Boolean(lead.recruiter_email);
  const showComposer = lane === "outreach" || hasContact;

  const review = (
    <LeadReview
      jobId={lead.job_id}
      appStatus={lead.app_status ?? "remaining"}
      defaultTo={lead.recruiter_email ?? ""}
      defaultSubject={lead.email_subject ?? ""}
      defaultBody={lead.email_body ?? ""}
      resumes={resumes}
      defaultResumeId={defaultResumeId}
      latestQueue={latestQueue}
      hideStatusControls={lane === "linkedin"}
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true"
         aria-label={`${lead.job_title ?? "Lead"} details`}>
      {/* Backdrop */}
      <button
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-[2px]"
      />

      {/* Slide-over panel */}
      <div className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-border bg-bg shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border-soft bg-bg/95 px-6 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {lead.job_title ?? "Untitled role"}
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted">
              {lead.company ?? "Unknown"} · {lead.source ?? "—"}
              {lead.matched_track ? ` · ${lead.matched_track}` : ""}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <StatusBadge
                status={lead.app_status ?? "remaining"}
                meta={appStatusMeta(lead.app_status ?? "remaining")}
              />
              {lead.match_score != null && (
                <span className="text-xs text-muted">
                  Score <span className="tabular-nums text-fg">{lead.match_score}</span>
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg border border-border-soft px-2.5 py-1.5 text-sm text-muted transition hover:bg-white/5 hover:text-fg"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="px-6 pb-10">
          {/* LinkedIn lane: applying happens on LinkedIn, so lead with the link. */}
          {lane === "linkedin" && (
            <section className="card mt-5 p-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">Apply</h3>
              <div className="flex flex-wrap items-center gap-3">
                {lead.job_url ? (
                  <a
                    href={lead.job_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
                  >
                    Open on LinkedIn ↗
                  </a>
                ) : (
                  <span className="text-sm text-faint">No job link stored.</span>
                )}
                <LeadStatusControls jobId={lead.job_id} appStatus={lead.app_status ?? "remaining"} />
              </div>
              <p className="mt-3 text-xs text-faint">
                Apply on LinkedIn, then mark it applied here so it drops out of your queue.
              </p>
            </section>
          )}

          {/* Contact */}
          <section className="card mt-5 p-5">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Contact</h3>
              {lead.email_source && (
                <span className="text-xs text-faint">
                  via {lead.email_source}
                  {lead.email_confidence ? ` · ${lead.email_confidence} confidence` : ""}
                </span>
              )}
            </div>
            {hasContact ? (
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
                Lookups run automatically after each scrape and every 6 hours, best
                match score first. You can also type a recipient in below and apply anyway.
              </p>
            )}
          </section>

          {/* Email composer. Primary in the outreach lane; opt-in on LinkedIn. */}
          {showComposer && lane === "outreach" && review}
          {showComposer && lane === "linkedin" && (
            <details className="card mt-5 p-5">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-faint">
                Email this contact instead
                <span className="ml-2 font-normal normal-case tracking-normal text-faint">
                  (a recruiter address was found for this company)
                </span>
              </summary>
              {review}
            </details>
          )}

          {/* Scoring / meta */}
          <section className="card mt-5 grid grid-cols-2 gap-4 p-5">
            <Field label="Geo eligible" value={lead.geo_eligible == null ? "—" : lead.geo_eligible ? "Yes" : "No"} />
            <Field label="Publisher" value={lead.publisher} />
            <div className="col-span-2"><Field label="Geo reason" value={lead.geo_reason} /></div>
            <div className="col-span-2"><Field label="Matched keywords" value={lead.matched_keywords} /></div>
            <Field label="Posted" value={fmtDateTime(lead.posted_date)} />
            <Field label="Enriched" value={fmtDateTime(lead.enriched_at)} />
            {lead.notes && <div className="col-span-2"><Field label="Notes" value={lead.notes} /></div>}
          </section>

          {lead.job_description && (
            <details className="card mt-5 p-5">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-faint">
                Job description
              </summary>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                {lead.job_description}
              </p>
            </details>
          )}

          <a
            href={`/job-applications/leads/${encodeURIComponent(lead.job_id)}`}
            className="mt-5 inline-block text-xs text-faint underline-offset-4 transition hover:text-muted hover:underline"
          >
            Open as a full page
          </a>
        </div>
      </div>
    </div>
  );
}

// Small inline status control for the LinkedIn lane (Mark applied + dropdown
// live in LeadReview otherwise, which is hidden here).
function LeadStatusControls({ jobId, appStatus }: { jobId: string; appStatus: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const set = (value: string) =>
    startTransition(async () => {
      await setAppStatusAction(jobId, value);
      router.refresh();
    });

  return (
    <>
      <button
        disabled={pending || appStatus === "applied"}
        onClick={() => set("applied")}
        className="rounded-lg bg-ok/15 px-3 py-2 text-sm font-medium text-ok ring-1 ring-inset ring-ok/25 transition hover:bg-ok/25 disabled:opacity-40"
      >
        {appStatus === "applied" ? "Applied ✓" : "Mark applied"}
      </button>
      <select
        value={appStatus}
        disabled={pending}
        onChange={(e) => set(e.target.value)}
        className="rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-accent/60"
      >
        {APP_STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </>
  );
}
