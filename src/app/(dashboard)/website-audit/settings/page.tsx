import { supabaseRead, supabaseAdmin } from "@/lib/supabase";
import { AuditSettingsForm } from "@/components/AuditSettingsForm";
import type { AuditSettings } from "@/lib/audit";

export const dynamic = "force-dynamic";

export default async function AuditSettingsPage() {
  const { data } = await supabaseRead().from("audit_settings").select("*").eq("id", "singleton").limit(1);
  const settings = (data?.[0] as AuditSettings | undefined) ?? null;

  const { data: ga } = await supabaseAdmin()
    .from("gmail_auth").select("gmail_address,refresh_token").eq("id", "singleton").limit(1);
  const gmail = ga?.[0];
  const connected = Boolean(gmail?.refresh_token);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">Sender identity, brand, booking link, and the go-live toggle.</p>
      </header>

      {/* Gmail connection (shared account with the job-app automation) */}
      <div className="card mb-6 flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <div className="text-sm font-medium text-fg">Sending account (Gmail / Workspace)</div>
          {connected ? (
            <div className="mt-1 flex items-center gap-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 font-medium text-ok ring-1 ring-inset ring-ok/25">
                <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Connected
              </span>
              <span className="font-mono">{gmail?.gmail_address || "Gmail account"}</span>
            </div>
          ) : (
            <div className="mt-1 max-w-md text-xs text-faint">
              Connect the Workspace address outreach sends from (grants send + reply-read).
            </div>
          )}
        </div>
        <a
          href="/api/google/auth"
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            connected
              ? "border border-border text-muted hover:bg-white/5 hover:text-fg"
              : "bg-accent text-white shadow-lg shadow-accent/20 hover:bg-accent/90"
          }`}
        >
          {connected ? "Reconnect" : "Connect Gmail"}
        </a>
      </div>

      {/* Logo preview (hosted PNG used in the email header) */}
      {settings?.logo_url && (
        <div className="card mb-6 flex items-center gap-4 p-5">
          <div className="grid h-12 w-16 place-items-center rounded-lg bg-[#0A0A0B]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={settings.logo_url} alt="Logo" className="max-h-8 max-w-12" />
          </div>
          <div className="text-xs text-faint">Email header logo (white-on-dark). Edit the URL below to change it.</div>
        </div>
      )}

      <AuditSettingsForm settings={settings} />
    </div>
  );
}
