import { randomBytes } from "node:crypto";

/**
 * Generate a UUIDv7 string (`time_high-time_mid-ver_rand-var_rand-rand`).
 *
 * Prefers `Bun.randomUUIDv7()` when available (Bun ≥ 1.1.x), falling back to
 * a small manual implementation so this module is portable across runtimes
 * and trivially testable.
 */
export function uuidv7(): string {
  const bunRng = (globalThis as { Bun?: { randomUUIDv7?: () => string } }).Bun;
  if (bunRng?.randomUUIDv7) return bunRng.randomUUIDv7();

  const bytes = randomBytes(16);
  const ms = BigInt(Date.now());
  bytes[0] = Number((ms >> 40n) & 0xffn);
  bytes[1] = Number((ms >> 32n) & 0xffn);
  bytes[2] = Number((ms >> 24n) & 0xffn);
  bytes[3] = Number((ms >> 16n) & 0xffn);
  bytes[4] = Number((ms >> 8n) & 0xffn);
  bytes[5] = Number(ms & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
