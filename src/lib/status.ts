// Visual + label mapping for lead statuses. Tailwind needs literal class strings,
// so each status carries its full chip class set (text + ring + bg tints).

export interface StatusMeta {
  label: string;
  chip: string;
  dot: string;
}

const META: Record<string, StatusMeta> = {
  new:          { label: "New",          chip: "text-info bg-info/10 ring-info/25",       dot: "bg-info" },
  scored:       { label: "Scored",       chip: "text-info bg-info/10 ring-info/25",       dot: "bg-info" },
  enriched:     { label: "Enriched",     chip: "text-accent-2 bg-accent-2/10 ring-accent-2/25", dot: "bg-accent-2" },
  applied:      { label: "Applied",      chip: "text-ok bg-ok/10 ring-ok/25",             dot: "bg-ok" },
  followed_up:  { label: "Followed up",  chip: "text-warn bg-warn/10 ring-warn/25",       dot: "bg-warn" },
  replied:      { label: "Replied",      chip: "text-ok bg-ok/15 ring-ok/30",             dot: "bg-ok" },
  closed:       { label: "Closed",       chip: "text-faint bg-white/5 ring-white/10",     dot: "bg-faint" },
  dry_run:      { label: "Dry run",      chip: "text-warn bg-warn/10 ring-warn/25",       dot: "bg-warn" },
  manual_apply: { label: "Manual apply", chip: "text-violet bg-violet/10 ring-violet/25", dot: "bg-violet" },
  geo_blocked:  { label: "Geo blocked",  chip: "text-faint bg-white/5 ring-white/10",     dot: "bg-faint" },
  low_match:    { label: "Low match",    chip: "text-faint bg-white/5 ring-white/10",     dot: "bg-faint" },
  score_error:  { label: "Score error",  chip: "text-danger bg-danger/10 ring-danger/25", dot: "bg-danger" },
};

export function statusMeta(status: string): StatusMeta {
  return META[status] ?? { label: status, chip: "text-muted bg-white/5 ring-white/10", dot: "bg-muted" };
}

// Statuses that represent a genuine apply-track lead (vs filtered-out noise).
export const ACTIVE_STATUSES = ["dry_run", "applied", "followed_up", "replied", "manual_apply", "enriched", "scored"];
