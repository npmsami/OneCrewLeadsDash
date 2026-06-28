"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, tokenFor } from "@/lib/auth";

export interface LoginState {
  error: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.DASHBOARD_PASSWORD ?? "";

  if (!expected) return { error: "Login is not configured (DASHBOARD_PASSWORD missing)." };
  if (password !== expected) return { error: "Incorrect password." };

  const jar = await cookies();
  jar.set(AUTH_COOKIE, await tokenFor(expected), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  const next = String(formData.get("next") || "/");
  redirect(next.startsWith("/") ? next : "/");
}
