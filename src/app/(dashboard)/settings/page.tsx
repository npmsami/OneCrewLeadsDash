import { supabaseRead, supabaseAdmin } from "@/lib/supabase";
import { SettingsForm } from "@/components/SettingsForm";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

const GMAIL_MSG: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Gmail connected." },
  error: { ok: false, text: "Couldn't connect Gmail — please try again." },
  no_refresh: { ok: false, text: "No refresh token returned. Click Reconnect (revoke prior access in your Google account if it repeats)." },
  state_error: { ok: false, text: "Session expired — please try connecting again." },
  store_error: { ok: false, text: "Authorized, but storing the token failed — try again." },
  not_configured: { ok: false, text: "Google OAuth isn't configured on the server." },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string }>;
}) {
  const { gmail: gmailStatus } = await searchParams;

  const { data } = await supabaseRead().from("settings").select("*").eq("id", "singleton").limit(1);
  const settings = (data?.[0] as Settings | undefined) ?? null;

  const { data: ga } = await supabaseAdmin()
    .from("gmail_auth")
    .select("gmail_address,refresh_token,connected_at")
    .eq("id", "singleton")
    .limit(1);
  const gmail = ga?.[0];
  const connected = Boolean(gmail?.refresh_token);
  const banner = gmailStatus ? GMAIL_MSG[gmailStatus] : null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Candidate Signature</h1>
        <p className="mt-1 text-sm text-muted">
          Identity, resume and email templates used for every application.
        </p>
      </header>

      {/* Gmail connection */}
      <div className="card mb-6 flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <div className="text-sm font-medium text-fg">Email sending account</div>
          {connected ? (
            <div className="mt-1 flex items-center gap-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 font-medium text-ok ring-1 ring-inset ring-ok/25">
                <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Connected
              </span>
              <span className="font-mono">{gmail?.gmail_address || "Gmail account"}</span>
            </div>
          ) : (
            <div className="mt-1 max-w-md text-xs text-faint">
              Connect the Gmail / Workspace address that applications send from. Grants send + reply-read access.
            </div>
          )}
          {banner && (
            <div className={`mt-2 text-xs ${banner.ok ? "text-ok" : "text-danger"}`}>{banner.text}</div>
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

      <SettingsForm settings={settings} />
    </div>
  );
}
