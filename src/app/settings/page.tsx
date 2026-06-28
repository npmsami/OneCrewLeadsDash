import { supabaseRead } from "@/lib/supabase";
import { SettingsForm } from "@/components/SettingsForm";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const sb = supabaseRead();
  const { data } = await sb.from("settings").select("*").eq("id", "singleton").limit(1);
  const settings = (data?.[0] as Settings | undefined) ?? null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Candidate Signature</h1>
        <p className="mt-1 text-sm text-muted">
          Identity and resume attached to every outgoing application email.
        </p>
      </header>
      <SettingsForm settings={settings} />
    </div>
  );
}
