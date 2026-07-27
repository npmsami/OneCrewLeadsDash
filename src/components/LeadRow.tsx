"use client";

import { useRouter } from "next/navigation";
import { StatusBadge } from "./StatusBadge";
import { appStatusMeta } from "@/lib/status";
import type { Application } from "@/lib/types";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// One row of the leads table. Clicking it opens the lead's detail page (email
// review + Apply + status controls).
export function LeadRow({ lead }: { lead: Application }) {
  const router = useRouter();
  const href = `/job-applications/leads/${encodeURIComponent(lead.job_id)}`;

  return (
    <tr
      onClick={() => router.push(href)}
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
      <td className="px-3 py-3.5">
        <StatusBadge status={lead.app_status ?? "remaining"} meta={appStatusMeta(lead.app_status ?? "remaining")} />
      </td>
      <td className="max-w-[14rem] px-3 py-3.5">
        <span className="block truncate text-xs text-muted">{lead.recruiter_email || "—"}</span>
        {lead.recruiter_name && (
          <span className="block truncate text-[11px] text-faint">
            {lead.recruiter_name}
            {lead.recruiter_title ? ` · ${lead.recruiter_title}` : ""}
          </span>
        )}
      </td>
      <td className="px-5 py-3.5 text-right text-xs text-faint">{fmtDate(lead.posted_date)}</td>
    </tr>
  );
}
