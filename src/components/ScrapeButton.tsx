"use client";

import { useState, useTransition } from "react";
import { triggerScrapeAction } from "@/app/(dashboard)/job-applications/scrape-action";
import type { ScrapeState } from "@/lib/scrape";

export function ScrapeButton() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setMsg(null);
    startTransition(async () => {
      const r: ScrapeState = await triggerScrapeAction();
      setMsg({ ok: r.ok, text: r.message });
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={onClick}
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Starting…" : "Scrape leads"}
      </button>
      {msg ? (
        <span className={`text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>
      ) : (
        <span className="text-xs text-faint">Pulls fresh leads from JSearch &amp; Apify</span>
      )}
    </div>
  );
}
