import { createHmac, timingSafeEqual } from "crypto";

// Mirror of agent/agent/unsub.py: token = first 24 hex of
// HMAC-SHA256(SUPABASE_SERVICE_ROLE_KEY, "unsub:"+lowercased-email).
// SERVER ONLY — reads the service-role key.

export function unsubToken(email: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHmac("sha256", key)
    .update("unsub:" + email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 24);
}

export function verifyUnsub(email: string, token: string): boolean {
  if (!email || !token) return false;
  const expected = unsubToken(email);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}
