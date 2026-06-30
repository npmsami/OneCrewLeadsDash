"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AUTOMATIONS, automationForPath } from "@/lib/automations";

const ICONS: Record<string, (p: { className?: string }) => React.ReactElement> = {
  "job-applications": BriefcaseIcon,
  "website-audit": MailIcon,
};

export function Sidebar() {
  const pathname = usePathname();
  const active = automationForPath(pathname);

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col gap-1 border-r border-border-soft bg-bg-soft/60 px-4 py-6">
      <Link href={active.basePath} className="mb-7 flex items-center gap-2.5 px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="One Crew" className="h-9 w-9 shrink-0" />
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">One Crew</span>
          <span className="text-[11px] text-faint">Automation Hub</span>
        </span>
      </Link>

      {/* Automation switcher */}
      <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-faint">
        Automations
      </div>
      <nav className="flex flex-col gap-1">
        {AUTOMATIONS.map((a) => {
          const Icon = ICONS[a.id] ?? BriefcaseIcon;
          const isActive = a.id === active.id;

          if (!a.available) {
            return (
              <div
                key={a.id}
                title="Coming soon"
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-faint/70"
              >
                <Icon className="text-faint/60" />
                <span className="flex-1 truncate">{a.name}</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-faint ring-1 ring-inset ring-border-soft">
                  Soon
                </span>
              </div>
            );
          }

          return (
            <Link
              key={a.id}
              href={a.basePath}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-accent-soft text-fg ring-1 ring-accent/30"
                  : "text-muted hover:bg-white/5 hover:text-fg"
              }`}
            >
              <Icon className={isActive ? "text-accent-2" : "text-faint group-hover:text-muted"} />
              <span className="truncate">{a.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Active automation's sub-nav */}
      <div className="mt-7 mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-faint">
        {active.name}
      </div>
      <nav className="flex flex-col gap-1">
        {active.nav.map(({ href, label }) => {
          const on =
            href === active.basePath ? pathname === active.basePath : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                on
                  ? "bg-white/[0.06] text-fg"
                  : "text-muted hover:bg-white/5 hover:text-fg"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${on ? "bg-accent-2" : "bg-faint/40"}`}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-border-soft bg-panel/50 px-3 py-3 text-[11px] leading-relaxed text-faint">
        Dry-run mode — drafts are stored, not sent. Flip the go-live toggle on the
        Settings page when ready.
      </div>
    </aside>
  );
}

function BriefcaseIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}
function MailIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
