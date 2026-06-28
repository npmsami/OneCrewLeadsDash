import { statusMeta } from "@/lib/status";

export function StatusBadge({ status }: { status: string }) {
  const { label, chip, dot } = statusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
