"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "./StatusBadge";
import { queueStatusMeta } from "@/lib/status";
import { fmtDateTime } from "@/lib/datetime";
import { APP_STATUSES, type OutreachQueue, type Resume } from "@/lib/types";
import {
  enqueueOutreachAction,
  cancelOutreachAction,
  retryOutreachAction,
  setAppStatusAction,
} from "@/app/(dashboard)/job-applications/actions";

interface Props {
  jobId: string;
  appStatus: string;
  defaultTo: string;
  defaultSubject: string;
  defaultBody: string;
  resumes: Resume[];
  defaultResumeId: string | null;
  latestQueue: OutreachQueue | null;
  /** The LinkedIn lane renders its own Mark-applied controls, so skip ours. */
  hideStatusControls?: boolean;
}

const inputClass =
  "w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/25";

export function LeadReview(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [to, setTo] = useState(props.defaultTo);
  const [subject, setSubject] = useState(props.defaultSubject);
  const [body, setBody] = useState(props.defaultBody);
  const [resumeId, setResumeId] = useState(props.defaultResumeId ?? "");

  const latest = props.latestQueue;
  const activeQueue = latest && ["queued", "sending", "sent"].includes(latest.status);

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });
  }

  const apply = () =>
    run(() => enqueueOutreachAction(props.jobId, { to, subject, body, resumeId: resumeId || null }));

  return (
    <div className="mt-6 space-y-6">
      {/* Queue status banner */}
      {latest && (
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">Outreach status</h2>
            <StatusBadge status={latest.status} meta={queueStatusMeta(latest.status)} />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-faint">Recipient: </span>{latest.to_email}</div>
            {latest.status === "queued" && (
              <div><span className="text-faint">Sends after: </span>{fmtDateTime(latest.scheduled_at)}</div>
            )}
            {latest.status === "sent" && (
              <div><span className="text-faint">Sent: </span>{fmtDateTime(latest.sent_at)}</div>
            )}
            {latest.last_error && (
              <div className="col-span-2 text-danger"><span className="text-faint">Error: </span>{latest.last_error}</div>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            {latest.status === "queued" && (
              <button
                disabled={pending}
                onClick={() => run(() => cancelOutreachAction(latest.id, props.jobId))}
                className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-fg disabled:opacity-50"
              >
                Cancel queued email
              </button>
            )}
            {latest.status === "failed" && (
              <button
                disabled={pending}
                onClick={() => run(() => retryOutreachAction(latest.id, props.jobId))}
                className="rounded-lg border border-border px-3 py-2 text-sm text-fg transition hover:bg-white/5 disabled:opacity-50"
              >
                Retry
              </button>
            )}
          </div>
        </section>
      )}

      {/* Editable email review + Apply — hidden while an email is queued/sending/sent */}
      {!activeQueue && (
        <section className="card p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-faint">Review &amp; apply</h2>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Recipient email</span>
              <input className={inputClass} type="email" value={to} onChange={(e) => setTo(e.target.value)}
                placeholder="recruiter@company.com" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Subject</span>
              <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Body</span>
              <textarea className={`${inputClass} min-h-[220px] resize-y font-sans leading-relaxed`}
                value={body} onChange={(e) => setBody(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Resume attachment</span>
              <select className={inputClass} value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
                <option value="">No attachment</option>
                {props.resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.filename}{r.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
              {props.resumes.length === 0 && (
                <span className="mt-1 block text-xs text-faint">
                  No resumes uploaded — add one in Settings to attach it.
                </span>
              )}
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              disabled={pending}
              onClick={apply}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
            >
              {pending ? "Working…" : "Apply — queue this email"}
            </button>
            <span className="text-xs text-faint">Nothing sends now; it joins the spaced outreach queue.</span>
          </div>
        </section>
      )}

      {/* Manual status controls */}
      {!props.hideStatusControls && (
      <section className="card p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">Status</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={pending || props.appStatus === "applied"}
            onClick={() => run(() => setAppStatusAction(props.jobId, "applied"))}
            className="rounded-lg bg-ok/15 px-3 py-2 text-sm font-medium text-ok ring-1 ring-inset ring-ok/25 transition hover:bg-ok/25 disabled:opacity-40"
          >
            Mark applied
          </button>
          <label className="flex items-center gap-2 text-sm text-muted">
            <span>Set status</span>
            <select
              className={inputClass}
              value={props.appStatus}
              disabled={pending}
              onChange={(e) => run(() => setAppStatusAction(props.jobId, e.target.value))}
            >
              {APP_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-faint">
          For LinkedIn / manual applications, mark it applied here once you&apos;ve submitted.
        </p>
      </section>
      )}

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>
      )}
    </div>
  );
}
