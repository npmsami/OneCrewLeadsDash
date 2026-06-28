import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Exchanges the OAuth code for tokens, records the refresh token + connected
// address in the locked gmail_auth table, then returns to /settings.
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const sp = req.nextUrl.searchParams;
  const back = (status: string) => NextResponse.redirect(new URL(`/settings?gmail=${status}`, origin));

  if (sp.get("error")) return back("error");

  const code = sp.get("code");
  const state = sp.get("state");
  const cookieState = req.cookies.get("g_oauth_state")?.value;
  if (!code || !state || state !== cookieState) return back("state_error");

  // 1. code -> tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${origin}/api/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const tok = await tokenRes.json();
  if (!tokenRes.ok) return back("error");
  if (!tok.refresh_token) return back("no_refresh"); // happens if user previously consented; prompt=consent should prevent this

  // 2. which address connected?
  let email = "";
  try {
    const ui = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (ui.ok) email = (await ui.json()).email ?? "";
  } catch {
    /* address is best-effort */
  }

  // 3. store in the locked table (service role)
  const { error } = await supabaseAdmin().from("gmail_auth").upsert(
    {
      id: "singleton",
      gmail_address: email,
      refresh_token: tok.refresh_token,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) return back("store_error");

  const res = back("connected");
  res.cookies.delete("g_oauth_state");
  return res;
}
