"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getScrapeProgress } from "@/app/(dashboard)/job-applications/scrape-status";
import {
  SCRAPE_WATCH_KEY, SCRAPE_POLL_MS, SCRAPE_WATCH_TIMEOUT_MS,
} from "@/lib/scrape";

/**
 * Watches for a scrape that is running on GitHub Actions and refreshes the page
 * when it lands, so new leads show up on their own.
 *
 * Mounted in the dashboard layout rather than next to the button, because a
 * scrape takes minutes and the user will usually navigate away from Overview
 * while it runs. The in-flight marker lives in localStorage so the watch
 * survives that navigation (and a reload).
 */
export function ScrapeWatcher() {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const startedAt = useRef<string | null>(null);
  const [watching, setWatching] = useState(false);

  // Pick up an in-flight scrape on mount and whenever the button starts one.
  useEffect(() => {
    const read = () => {
      const v = window.localStorage.getItem(SCRAPE_WATCH_KEY);
      startedAt.current = v;
      setWatching(Boolean(v));
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("onecrew:scrape-started", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("onecrew:scrape-started", read);
    };
  }, []);

  const stop = useCallback(() => {
    window.localStorage.removeItem(SCRAPE_WATCH_KEY);
    startedAt.current = null;
    setWatching(false);
  }, []);

  useEffect(() => {
    if (!watching) return;

    let cancelled = false;

    const tick = async () => {
      const since = startedAt.current;
      if (!since) return;

      // Don't poll forever behind a stuck run.
      if (Date.now() - new Date(since).getTime() > SCRAPE_WATCH_TIMEOUT_MS) {
        stop();
        setToast("Scrape is taking longer than expected — check the Actions tab.");
        return;
      }

      let progress;
      try {
        progress = await getScrapeProgress(since);
      } catch {
        return; // transient; try again next tick
      }
      if (cancelled || !progress.done) return;

      stop();
      const msg = `Scrape finished: ${progress.totalScraped} new lead${
        progress.totalScraped === 1 ? "" : "s"
      }, ${progress.qualified} qualified.`;
      setToast(msg);
      notify(msg);
      router.refresh();
    };

    void tick();
    const id = setInterval(tick, SCRAPE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [watching, router, stop]);

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(id);
  }, [toast]);

  if (!watching && !toast) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-2">
      {watching && (
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-border bg-panel/95 px-4 py-2.5 text-sm text-muted shadow-xl backdrop-blur">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent-2" />
          Scraping leads… this page updates itself when it finishes.
        </div>
      )}
      {toast && (
        <div className="pointer-events-auto rounded-xl border border-ok/30 bg-ok/10 px-4 py-2.5 text-sm text-ok shadow-xl backdrop-blur">
          {toast}
        </div>
      )}
    </div>
  );
}

/** Desktop notification, if the user granted permission. Never prompts here —
 *  the prompt belongs on a click (see ScrapeButton). */
function notify(body: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    new Notification("One Crew — Leads Hub", { body, tag: "onecrew-scrape" });
  } catch {
    /* notifications unsupported or blocked — the in-app toast still shows */
  }
}
