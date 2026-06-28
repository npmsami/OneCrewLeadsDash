import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/**
 * Read client (publishable/anon key). RLS allows SELECT on applications + settings.
 * Safe to use in Server Components for all dashboard reads.
 */
export function supabaseRead() {
  return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}

/**
 * Admin client (service-role key) — SERVER ONLY. Bypasses RLS for privileged
 * writes (Candidate Signature settings). Never import into a Client Component.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key, { auth: { persistSession: false } });
}
