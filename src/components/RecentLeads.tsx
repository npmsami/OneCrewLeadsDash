"use client";

import { useState } from "react";
import { StatusBadge } from "./StatusBadge";
import { LeadDrawer } from "./LeadDrawer";
import { appStatusMeta } from "@/lib/status";
import { LINKEDIN_SOURCE } from "@/lib/leads";
import type { Application, OutreachQueue, Resume } from "@/lib/types";

interface Props {
  leads: Application[];
  resumes: Resume[];
  defaultResumeId: string | null;
  queueByJob: Record<string, OutreachQueue>;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/** Overview's recent-activity list. Opens the same drawer as the leads tables
 *  so clicking a job never navigates you off the page you're on. */
export function RecentLeads({ leads, resumes, defaultResumeId, queueByJob }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = leads.find((l) => l.job_id === openId) ?? null;

  if (leads.length === 0) {
    return (
      <div className="px-5 py-12 text-center text-sm text-faint">
        No leads yet. Run the agent pipeline to populate.
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border-soft">
        {leads.map((l) => (
          <li key={l.job_id}>
            <button
              onClick={() => setOpenId(l.job_id)}
              className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-white/[0.03]"
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
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <LeadDrawer
          lead={open}
          resumes={resumes}
          defaultResumeId={defaultResumeId}
          latestQueue={queueByJob[open.job_id] ?? null}
          lane={open.source === LINKEDIN_SOURCE ? "linkedin" : "outreach"}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
