"use client";

import { useState } from "react";
import { StatusBadge } from "./StatusBadge";
import { LeadDrawer } from "./LeadDrawer";
import { appStatusMeta } from "@/lib/status";
import type { Application, OutreachQueue, Resume } from "@/lib/types";

type Lane = "linkedin" | "outreach";

interface Props {
  leads: Application[];
  resumes: Resume[];
  defaultResumeId: string | null;
  /** job_id -> that lead's most recent queue item, for the drawer's banner. */
  queueByJob: Record<string, OutreachQueue>;
  lane: Lane;
  emptyMessage?: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Leads table that opens each lead in a slide-over drawer rather than
 * navigating away — you can work down a list without losing your place or
 * your filters. The full-page route still exists for deep links.
 */
export function LeadsTable({ leads, resumes, defaultResumeId, queueByJob, lane, emptyMessage }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = leads.find((l) => l.job_id === openId) ?? null;

  const isLinkedIn = lane === "linkedin";

  return (
    <>
      <div className="card mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-3 py-3 font-medium">Track</th>
                <th className="px-3 py-3 text-right font-medium">Score</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">{isLinkedIn ? "Source" : "Contact"}</th>
                <th className="px-3 py-3 text-right font-medium">Posted</th>
                <th className="px-5 py-3 text-right font-medium">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {leads.map((l) => (
                <tr
                  key={l.job_id}
                  onClick={() => setOpenId(l.job_id)}
                  className="cursor-pointer transition hover:bg-white/[0.03]"
                >
                  <td className="max-w-xs px-5 py-3.5">
                    <span className="block truncate font-medium text-fg">
                      {l.job_title ?? "Untitled role"}
                    </span>
                    <span className="block truncate text-xs text-faint">
                      {l.company ?? "Unknown"}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-xs text-muted">{l.matched_track ?? "—"}</td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-muted">{l.match_score ?? "—"}</td>
                  <td className="px-3 py-3.5">
                    <StatusBadge
                      status={l.app_status ?? "remaining"}
                      meta={appStatusMeta(l.app_status ?? "remaining")}
                    />
                  </td>
                  <td className="max-w-[14rem] px-3 py-3.5">
                    {isLinkedIn ? (
                      <span className="text-xs text-muted">{l.publisher || l.source || "linkedin"}</span>
                    ) : (
                      <>
                        <span className="block truncate text-xs text-muted">
                          {l.recruiter_email || "—"}
                        </span>
                        {/* recruiter_name defaults to "Hiring Team" even on a
                            miss, so only show it alongside a real address. */}
                        {l.recruiter_email && l.recruiter_name && (
                          <span className="block truncate text-[11px] text-faint">
                            {l.recruiter_name}
                            {l.recruiter_title ? ` · ${l.recruiter_title}` : ""}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-right text-xs text-faint">{fmtDate(l.posted_date)}</td>
                  {/* Scrape date — the default sort key, so it has to be visible. */}
                  <td className="px-5 py-3.5 text-right text-xs text-faint">{fmtDate(l.created_at)}</td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-faint">
                    {emptyMessage ?? "No leads match these filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <LeadDrawer
          lead={open}
          resumes={resumes}
          defaultResumeId={defaultResumeId}
          latestQueue={queueByJob[open.job_id] ?? null}
          lane={lane}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
