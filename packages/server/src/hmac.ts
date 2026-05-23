import { createHmac, timingSafeEqual } from "node:crypto";

export const HMAC_HEADER = "x-backbar-sig";

/** Compute the canonical signature header value for a raw body. */
export function signBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/**
 * Verify `X-Backbar-Sig` matches HMAC-SHA256(body, secret). Both
 * `"sha256=<hex>"` and bare `<hex>` are accepted to ease curl debugging.
 * Returns false on missing / malformed / mismatched signatures.
 */
export function verifySignature(body: string, secret: string, header: string | null | undefined): boolean {
  if (!header) return false;
  const provided = header.startsWith("sha256=") ? header.slice("sha256=".length) : header;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
