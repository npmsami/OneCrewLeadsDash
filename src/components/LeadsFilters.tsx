"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  q: string;
  status: string;
  source: string;
  score: string;
  sort: string;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active (apply-track)" },
  { value: "dry_run", label: "Dry run" },
  { value: "applied", label: "Applied" },
  { value: "followed_up", label: "Followed up" },
  { value: "replied", label: "Replied" },
  { value: "manual_apply", label: "Manual apply" },
  { value: "geo_blocked", label: "Geo blocked" },
  { value: "low_match", label: "Low match" },
  { value: "score_error", label: "Score error" },
];

const SOURCE_OPTIONS = [
  "all", "remoteok", "remotive", "arbeitnow", "jobicy", "himalayas", "weworkremotely", "jsearch",
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

export function LeadsFilters(props: Props) {
  const router = useRouter();
  const [q, setQ] = useState(props.q);

  function pushWith(overrides: Partial<Props>) {
    const next: Props = { ...props, q, ...overrides };
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.status && next.status !== "all") params.set("status", next.status);
    if (next.source && next.source !== "all") params.set("source", next.source);
    if (next.score) params.set("score", next.score);
    if (next.sort && next.sort !== "score") params.set("sort", next.sort);
    const qs = params.toString();
    router.push(qs ? `/leads?${qs}` : "/leads");
  }

  const hasFilters =
    props.q || props.status !== "all" || props.source !== "all" || props.score || props.sort !== "score";

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

      <select className={selectClass} value={props.source} onChange={(e) => pushWith({ source: e.target.value })}>
        {SOURCE_OPTIONS.map((s) => (
          <option key={s} value={s}>{s === "all" ? "All sources" : s}</option>
        ))}
      </select>

      <select className={selectClass} value={props.score} onChange={(e) => pushWith({ score: e.target.value })}>
        {SCORE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <select className={selectClass} value={props.sort} onChange={(e) => pushWith({ sort: e.target.value })}>
        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {hasFilters && (
        <button
          onClick={() => { setQ(""); router.push("/leads"); }}
          className="rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-fg"
        >
          Clear
        </button>
      )}
    </div>
  );
}
