import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyUnsub } from "@/lib/unsub";

export const dynamic = "force-dynamic";

// Add the address to the permanent suppression list and drop it from any pending
// queue. Already-sent rows keep their 'sent' status (history); the suppression
// table is the source of truth that blocks all future sends + re-imports.
async function suppress(email: string, source: string) {
  const admin = supabaseAdmin();
  await admin.from("audit_suppressions").upsert(
    { email, source },
    { onConflict: "email", ignoreDuplicates: true },
  );
  await admin.from("audit_leads").update({ status: "unsubscribed" }).eq("email", email).eq("status", "pending");
}

function shell(title: string, inner: string, status = 200) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d10;color:#e7eaee;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.c{max-width:430px;padding:32px;text-align:center}.t{font-size:20px;font-weight:600;margin:0 0 10px}.s{color:#9aa3af;font-size:14px;line-height:1.6;margin:0 0 18px}
button{background:#6366f1;color:#fff;border:0;border-radius:8px;padding:11px 22px;font-size:14px;font-weight:600;cursor:pointer}</style></head>
<body><div class="c">${inner}</div></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function params(req: NextRequest) {
  const u = req.nextUrl.searchParams;
  return { email: (u.get("e") ?? "").trim().toLowerCase(), token: (u.get("t") ?? "").trim() };
}

// One-click (RFC 8058 header) and the confirm button both POST here.
export async function POST(req: NextRequest) {
  const { email, token } = params(req);
  if (!verifyUnsub(email, token)) return new NextResponse("Invalid", { status: 400 });
  await suppress(email, "unsubscribe");
  // Browser form submit wants a page; mail-client one-click just wants 200.
  if ((req.headers.get("accept") ?? "").includes("text/html")) {
    return shell("You’re unsubscribed", `<p class="t">You’re unsubscribed</p><p class="s"><strong>${email}</strong> won’t receive further emails from us.</p>`);
  }
  return new NextResponse(null, { status: 200 });
}

// Human click on the email link → confirmation page only (NO side effect, so a
// scanner/prefetch can't silently unsubscribe a real lead). The button POSTs.
export async function GET(req: NextRequest) {
  const { email, token } = params(req);
  if (!verifyUnsub(email, token)) {
    return shell("Link not valid", `<p class="t">Link not valid</p><p class="s">This unsubscribe link is invalid or expired. Reply “unsubscribe” to any email and we’ll remove you.</p>`, 400);
  }
  const action = `/api/unsubscribe?e=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}`;
  return shell(
    "Unsubscribe",
    `<p class="t">Unsubscribe</p><p class="s">Stop receiving emails at <strong>${email}</strong>?</p>
     <form method="POST" action="${action}"><button type="submit">Confirm unsubscribe</button></form>`,
  );
}
