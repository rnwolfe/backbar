/**
 * Returns a v4-shaped UUID. Prefers `crypto.randomUUID()` (secure contexts
 * only — HTTPS or localhost), falls back to `crypto.getRandomValues` + manual
 * formatting, and finally to `Math.random()` for non-secure LAN dev where
 * neither secure-context API is available.
 *
 * Only used for ephemeral client-side IDs (toasts, notices). Server-issued
 * IDs continue to be UUIDv7 from the API.
 */
export function uuid(): string {
  const g = globalThis as typeof globalThis & {
    crypto?: { randomUUID?: () => string; getRandomValues?: (b: Uint8Array) => Uint8Array };
  };

  if (g.crypto?.randomUUID) return g.crypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // RFC 4122 §4.4 — set version (4) and variant (10) bits
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
