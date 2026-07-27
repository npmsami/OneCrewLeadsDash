"use client";

import { useState, useTransition } from "react";
import { triggerEnrichAction } from "@/app/(dashboard)/job-applications/enrich-action";
import type { ScrapeState } from "@/lib/scrape";

interface Props {
  /** Look up one lead's company instead of working the whole backlog. */
  jobId?: string;
  label?: string;
  hint?: string;
  /** Secondary styling for use inside a lead card. */
  variant?: "primary" | "quiet";
}

export function FindEmailsButton({ jobId, label, hint, variant = "primary" }: Props) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setMsg(null);
    startTransition(async () => {
      const r: ScrapeState = await triggerEnrichAction(jobId);
      setMsg({ ok: r.ok, text: r.message });
    });
  }

  const styles =
    variant === "primary"
      ? "bg-accent-2/15 text-accent-2 ring-1 ring-inset ring-accent-2/30 hover:bg-accent-2/25"
      : "border border-border text-fg hover:bg-white/5";

  return (
    <div className={variant === "primary" ? "flex flex-col items-end gap-1.5" : "flex flex-col gap-1.5"}>
      <button
        onClick={onClick}
        disabled={pending}
        className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
      >
        {pending ? "Starting…" : (label ?? "Find emails")}
      </button>
      {msg ? (
        <span className={`text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>
      ) : (
        <span className="text-xs text-faint">{hint ?? "Hunter → Apollo, best-scoring leads first"}</span>
      )}
    </div>
  );
}
