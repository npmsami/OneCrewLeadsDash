import { statusMeta, type StatusMeta } from "@/lib/status";

// Pass `meta` to render a non-default status family (app_status / queue status);
// otherwise it falls back to the pipeline-status map.
export function StatusBadge({ status, meta }: { status: string; meta?: StatusMeta }) {
  const { label, chip, dot } = meta ?? statusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
