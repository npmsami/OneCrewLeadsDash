"use client";

import { useEffect, useState, useTransition } from "react";
import { triggerAuditRunAction } from "@/app/(dashboard)/website-audit/run-action";
import type { AuditRunState } from "@/lib/audit";

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export function RunOutreachButton({
  lockedUntil: initialLock,
  pendingCount,
  batchSize,
  sending,
}: {
  lockedUntil: string | null;
  pendingCount: number;
  batchSize: number;
  sending: boolean; // true = live send, false = dry-run drafts only
}) {
  const [lockedUntil, setLockedUntil] = useState<string | null>(initialLock);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
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
  const willProcess = Math.min(pendingCount, batchSize);

  function onClick() {
    setMsg(null);
    startTransition(async () => {
      const r: AuditRunState = await triggerAuditRunAction();
      setLockedUntil(r.lockedUntil);
      setMsg({ ok: r.ok, text: r.message });
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-3">
        <span className="text-xs text-faint">
          {pendingCount} pending · batch {batchSize}
        </span>
        <button
          onClick={onClick}
          disabled={locked || pending || pendingCount === 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? "Starting…"
            : locked
              ? `Running · ${fmt(remaining)}`
              : sending
                ? `Send ${willProcess} now`
                : `Draft ${willProcess} (dry-run)`}
        </button>
      </div>
      {msg ? (
        <span className={`text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>
      ) : pendingCount === 0 ? (
        <span className="text-xs text-faint">No pending leads — import a CSV first.</span>
      ) : locked ? (
        <span className="text-xs text-faint">Batch in progress · ~{fmt(remaining)} left</span>
      ) : sending ? (
        <span className="text-xs text-faint">Emails real recipients, ~18s apart (~15 min/batch)</span>
      ) : (
        <span className="text-xs text-amber-400/80">Dry-run: drafts only. Flip Send on in Settings to go live.</span>
      )}
    </div>
  );
}
