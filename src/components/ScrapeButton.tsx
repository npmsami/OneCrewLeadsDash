"use client";

import { useState, useTransition } from "react";
import { triggerScrapeAction } from "@/app/(dashboard)/job-applications/scrape-action";
import { SCRAPE_WATCH_KEY, type ScrapeState } from "@/lib/scrape";

export function ScrapeButton() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setMsg(null);

    // Ask for notification permission on the click itself — browsers reject
    // (and users resent) permission prompts that aren't tied to a gesture.
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    } catch {
      /* unsupported — the in-app toast is the fallback */
    }

    startTransition(async () => {
      const r: ScrapeState = await triggerScrapeAction();
      setMsg({ ok: r.ok, text: r.message });
      if (!r.ok) return;

      // Hand off to ScrapeWatcher (mounted in the layout): it polls for the run
      // to land, then refreshes whatever page you're on and notifies you.
      // Stamp slightly in the past so a fast run can't finish inside the gap
      // between dispatch and this write.
      const since = new Date(Date.now() - 60_000).toISOString();
      window.localStorage.setItem(SCRAPE_WATCH_KEY, since);
      window.dispatchEvent(new Event("onecrew:scrape-started"));
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
