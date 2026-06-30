import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, tokenFor } from "@/lib/auth";

// Next 16 "Proxy" (formerly Middleware). Gates the whole app behind a single
// shared password. If DASHBOARD_PASSWORD isn't set, the gate is disabled (so a
// misconfigured env never locks everyone out).
export async function proxy(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  if (req.nextUrl.pathname === "/login") return NextResponse.next();
  // Public endpoint — recipients clicking unsubscribe aren't logged in.
  if (req.nextUrl.pathname.startsWith("/api/unsubscribe")) return NextResponse.next();

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && cookie === (await tokenFor(password))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
