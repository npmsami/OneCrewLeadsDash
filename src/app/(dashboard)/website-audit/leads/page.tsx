import { supabaseRead } from "@/lib/supabase";
import { AuditUpload } from "@/components/AuditUpload";
import { EmailPreview } from "@/components/EmailPreview";
import { AUDIT_STATUS_META, type AuditLead } from "@/lib/audit";

export const dynamic = "force-dynamic";

const ROW_LIMIT = 500;

export default async function AuditLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "all";
  const q = (sp.q ?? "").trim();

  const sb = supabaseRead();
  let query = sb.from("audit_leads").select("*");
  if (status !== "all") query = query.eq("status", status);
  if (q) {
    const safe = q.replace(/[,()%*]/g, " ").trim();
    if (safe) query = query.or(`company.ilike.%${safe}%,email.ilike.%${safe}%,domain.ilike.%${safe}%`);
  }
  const { data } = await query.order("updated_at", { ascending: false }).limit(ROW_LIMIT);
  const leads = (data as AuditLead[] | undefined) ?? [];

  const tabs = ["all", "pending", "dry_run", "sent", "skipped", "send_error", "unsubscribed"];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="mt-1 text-sm text-muted">Import prospects and review the generated emails.</p>
      </header>

      <div className="mb-6">
        <AuditUpload />
      </div>

      {/* status filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = status === t;
          const label = t === "all" ? "All" : (AUDIT_STATUS_META[t]?.label ?? t);
          const href = t === "all" ? "/website-audit/leads" : `/website-audit/leads?status=${t}`;
          return (
            <a
              key={t}
              href={href}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                active ? "bg-accent-soft text-fg ring-1 ring-accent/30" : "text-muted hover:bg-white/5 hover:text-fg"
              }`}
            >
              {label}
            </a>
          );
        })}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-3 py-3 font-medium">Contact</th>
                <th className="px-3 py-3 font-medium">Subject</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {leads.map((l) => {
                const meta = AUDIT_STATUS_META[l.status] ?? AUDIT_STATUS_META.pending;
                return (
                  <tr key={l.email} className="hover:bg-white/[0.02]">
                    <td className="max-w-[14rem] px-5 py-3.5">
                      <span className="block truncate font-medium text-fg">{l.company || l.ai_business_name || "—"}</span>
                      <span className="block truncate text-xs text-faint">{l.domain || l.website || "—"}</span>
                    </td>
                    <td className="max-w-[12rem] px-3 py-3.5">
                      <span className="block truncate text-xs text-muted">{l.email}</span>
                      {l.first_name && <span className="text-[11px] text-faint">{l.first_name}</span>}
                    </td>
                    <td className="max-w-[16rem] px-3 py-3.5">
                      <span className="block truncate text-xs text-muted">{l.subject || "—"}</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${meta.cls}`}>
                        {meta.label}
                      </span>
                      {l.status === "send_error" && l.error && (
                        <span className="mt-1 block max-w-[10rem] truncate text-[10px] text-danger" title={l.error}>{l.error}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <EmailPreview html={l.email_html} label={l.subject || l.email} />
                    </td>
                  </tr>
                );
              })}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-faint">
                    No leads here yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {leads.length === ROW_LIMIT && (
        <p className="mt-3 text-center text-xs text-faint">Showing the first {ROW_LIMIT}. Use the status filter to narrow down.</p>
      )}
    </div>
  );
}
