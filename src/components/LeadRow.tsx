"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { StatusBadge } from "./StatusBadge";
import type { Application } from "@/lib/types";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// One row of the leads table. Click anywhere on the row to open a detail
// drawer showing the full drafted email + all scoring/enrichment fields.
export function LeadRow({ lead }: { lead: Application }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        onClick={() => setOpen(true)}
        className="cursor-pointer transition hover:bg-white/[0.03]"
      >
        <td className="max-w-xs px-5 py-3.5">
          <span className="block truncate font-medium text-fg">
            {lead.job_title ?? "Untitled role"}
          </span>
          <span className="block truncate text-xs text-faint">
            {lead.company ?? "Unknown"} · {lead.source ?? "—"}
          </span>
        </td>
        <td className="px-3 py-3.5 text-xs text-muted">{lead.matched_track ?? "—"}</td>
        <td className="px-3 py-3.5 text-right tabular-nums text-muted">{lead.match_score ?? "—"}</td>
        <td className="px-3 py-3.5"><StatusBadge status={lead.status} /></td>
        <td className="max-w-[14rem] px-3 py-3.5">
          <span className="block truncate text-xs text-muted">{lead.recruiter_email || "—"}</span>
          {lead.email_source && <span className="text-[11px] text-faint">{lead.email_source}</span>}
        </td>
        <td className="px-5 py-3.5 text-right text-xs text-faint">{fmtDate(lead.posted_date)}</td>
      </tr>
      {open && <LeadDetail lead={lead} onClose={() => setOpen(false)} />}
    </>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-faint">{label}</dt>
      <dd className={`mt-0.5 text-sm text-fg ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</dd>
    </div>
  );
}

function LeadDetail({ lead, onClose }: { lead: Application; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const hasEmail = Boolean(lead.email_body || lead.email_subject);
  const copyEmail = async () => {
    const text = [lead.email_subject ? `Subject: ${lead.email_subject}` : "", lead.email_body ?? ""]
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-border bg-panel shadow-2xl sm:rounded-xl sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border-soft px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-fg">{lead.job_title ?? "Untitled role"}</h2>
            <p className="mt-0.5 truncate text-xs text-muted">
              {lead.company ?? "Unknown"} · {lead.source ?? "—"}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <StatusBadge status={lead.status} />
              {lead.match_score != null && (
                <span className="text-xs text-muted">Score <span className="tabular-nums text-fg">{lead.match_score}</span></span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:bg-white/5 hover:text-fg"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* The drafted email */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Application email</h3>
              {hasEmail && (
                <button
                  onClick={copyEmail}
                  className="rounded-md border border-border-soft px-2 py-1 text-xs text-muted transition hover:bg-white/5 hover:text-fg"
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              )}
            </div>
            {hasEmail ? (
              <div className="rounded-lg border border-border-soft bg-bg-soft">
                {lead.email_subject && (
                  <div className="border-b border-border-soft px-4 py-2.5 text-sm text-fg">
                    <span className="text-faint">Subject: </span>{lead.email_subject}
                  </div>
                )}
                <pre className="whitespace-pre-wrap px-4 py-3 font-sans text-sm leading-relaxed text-muted">
                  {lead.email_body || "No body drafted."}
                </pre>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border-soft px-4 py-6 text-center text-xs text-faint">
                No draft yet — this lead was processed before drafting, or is still queued. Run a scrape to generate it.
              </p>
            )}
            {lead.status === "manual_apply" && (
              <p className="mt-2 text-xs text-faint">
                No recruiter email was found — apply manually via the posting and paste this draft.
              </p>
            )}
          </section>

          {/* Scoring */}
          <section className="grid grid-cols-2 gap-4">
            <Field label="Track" value={lead.matched_track} />
            <Field label="Seniority" value={lead.seniority_match} />
            <Field label="Geo eligible" value={lead.geo_eligible == null ? "—" : lead.geo_eligible ? "Yes" : "No"} />
            <Field label="Geo reason" value={lead.geo_reason} />
            <div className="col-span-2">
              <Field label="Matched keywords" value={lead.matched_keywords} />
            </div>
            <div className="col-span-2">
              <Field label="Missing keywords" value={lead.missing_keywords} />
            </div>
          </section>

          {/* Contact */}
          <section className="grid grid-cols-2 gap-4">
            <Field label="Recruiter" value={lead.recruiter_name} />
            <Field label="Email confidence" value={lead.email_confidence} />
            <div className="col-span-2">
              <Field label="Recruiter email" value={lead.recruiter_email} mono />
            </div>
            <Field label="Email source" value={lead.email_source} />
            <Field label="Resume" value={lead.resume_filename} />
          </section>

          {/* Meta */}
          <section className="grid grid-cols-2 gap-4">
            <Field label="Posted" value={fmtDate(lead.posted_date)} />
            <Field label="Scraped" value={fmtDateTime(lead.scraped_at)} />
            <Field label="Applied" value={fmtDateTime(lead.applied_at)} />
            <Field label="Updated" value={fmtDateTime(lead.updated_at)} />
            {lead.notes && (
              <div className="col-span-2">
                <Field label="Notes" value={lead.notes} />
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        {lead.job_url && (
          <div className="border-t border-border-soft px-5 py-3">
            <a
              href={lead.job_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-accent-2 hover:underline"
            >
              Open job posting ↗
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
