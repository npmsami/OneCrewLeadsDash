// Lightweight password gate. The cookie stores a SHA-256 of the password (never
// the password itself), so the raw secret is never in the browser. Works in both
// the edge proxy runtime and Node server actions (Web Crypto is available in both).

export const AUTH_COOKIE = "oc_auth";

export async function tokenFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(`one-crew::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
