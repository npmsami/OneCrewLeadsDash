"use client";

import { useEffect, useState, useTransition } from "react";
import { triggerScrapeAction } from "@/app/(dashboard)/job-applications/scrape-action";
import type { ScrapeState } from "@/lib/scrape";

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function ScrapeButton({
  lockedUntil: initialLock,
  hunterToday,
  hunterCap,
}: {
  lockedUntil: string | null;
  hunterToday: number;
  hunterCap: number;
}) {
  const [lockedUntil, setLockedUntil] = useState<string | null>(initialLock);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // null until mounted so SSR and first client render match (no hydration drift
  // on the live countdown); the interval fills it in on the client.
  const [now, setNow] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const unlockMs = lockedUntil ? new Date(lockedUntil).getTime() : 0;
  const remaining = now != null && unlockMs ? unlockMs - now : 0;
  const locked = remaining > 0;

  function onClick() {
    setMsg(null);
    startTransition(async () => {
      const r: ScrapeState = await triggerScrapeAction();
      setLockedUntil(r.lockedUntil);
      setMsg({ ok: r.ok, text: r.message });
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-3">
        <span className="text-xs text-faint">
          Hunter today <span className="tabular-nums text-muted">{hunterToday}/{hunterCap}</span>
        </span>
        <button
          onClick={onClick}
          disabled={locked || pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Starting…" : locked ? `Locked · ${fmt(remaining)}` : "Scrape leads"}
        </button>
      </div>
      {msg ? (
        <span className={`text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>
      ) : locked ? (
        <span className="text-xs text-faint">One scrape per 24h · unlocks in {fmt(remaining)}</span>
      ) : (
        <span className="text-xs text-faint">Discovers, scores & enriches up to {hunterCap} leads</span>
      )}
    </div>
  );
}
