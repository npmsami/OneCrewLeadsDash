"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  type LeadFilterParams,
  hasActiveFilters,
  leadFiltersToQuery,
  SOURCE_OPTIONS,
} from "@/lib/leads";

// Filters stay on whatever lane you are viewing (All Leads / LinkedIn Apply /
// Send Emails), so navigating never yanks you out of your section.
const FALLBACK_PATH = "/job-applications/leads";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "remaining", label: "Remaining" },
  { value: "queued", label: "Queued" },
  { value: "applied", label: "Applied" },
  { value: "done", label: "Done" },
  { value: "failed", label: "Failed" },
];

const QUALIFIED_OPTIONS = [
  { value: "all", label: "Qualified: any" },
  { value: "yes", label: "Qualified" },
  { value: "no", label: "Unqualified" },
];

const EMAIL_OPTIONS = [
  { value: "all", label: "Email: any" },
  { value: "yes", label: "Has email" },
  { value: "no", label: "No email" },
];

const SCORE_OPTIONS = [
  { value: "", label: "Any score" },
  { value: "70", label: "70+" },
  { value: "80", label: "80+" },
  { value: "90", label: "90+" },
];

const SORT_OPTIONS = [
  { value: "score", label: "Top match" },
  { value: "posted", label: "Newest" },
  { value: "updated", label: "Recently updated" },
];

const selectClass =
  "rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/25";

export function LeadsFilters(props: LeadFilterParams) {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname || FALLBACK_PATH;
  const [q, setQ] = useState(props.q);

  function pushWith(overrides: Partial<LeadFilterParams>) {
    const next: LeadFilterParams = { ...props, q, ...overrides };
    const qs = leadFiltersToQuery(next);
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  return (
    <div className="glass flex flex-wrap items-center gap-2.5 rounded-xl p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          pushWith({});
        }}
        className="relative min-w-[200px] flex-1"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search role or company…"
          className="w-full rounded-lg border border-border bg-panel-2 py-2 pl-9 pr-3 text-sm text-fg placeholder:text-faint outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/25"
        />
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-faint">
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </form>

      <select className={selectClass} value={props.status} onChange={(e) => pushWith({ status: e.target.value })}>
        {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <select className={selectClass} value={props.qualified} onChange={(e) => pushWith({ qualified: e.target.value })}>
        {QUALIFIED_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <select className={selectClass} value={props.source} onChange={(e) => pushWith({ source: e.target.value })}>
        {SOURCE_OPTIONS.map((s) => (
          <option key={s} value={s}>{s === "all" ? "All sources" : s}</option>
        ))}
      </select>

      <select className={selectClass} value={props.email} onChange={(e) => pushWith({ email: e.target.value })}>
        {EMAIL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <select className={selectClass} value={props.score} onChange={(e) => pushWith({ score: e.target.value })}>
        {SCORE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <select className={selectClass} value={props.sort} onChange={(e) => pushWith({ sort: e.target.value })}>
        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {hasActiveFilters(props) && (
        <button
          onClick={() => { setQ(""); router.push(basePath); }}
          className="rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-fg"
        >
          Clear
        </button>
      )}
    </div>
  );
}
