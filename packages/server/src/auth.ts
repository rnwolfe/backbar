/**
 * Operator bearer-token auth for the production surface.
 *
 * Mirrors the factory daemon's gate: a single shared token (no per-user
 * accounts) carried as `Authorization: Bearer <token>` on API calls or as a
 * `?token=` query param on the WebSocket upgrade (browsers can't set headers
 * on a WS handshake).
 *
 * The token is read from `process.env.BACKBAR_TOKEN`. When it is unset — dev,
 * tests, any local run — `isAuthorized` returns true for everything, so the
 * gate is invisible until prod opts in by setting the env var. Sensing and the
 * public guest surface never go through this.
 */

/** True when an operator token is configured (prod). Dev/tests leave it unset. */
export function authEnabled(): boolean {
  return !!process.env.BACKBAR_TOKEN;
}

/**
 * Pull a bearer token from a Fetch `Request`:
 *   1. `Authorization: Bearer <token>` header (normal API calls)
 *   2. `?token=<token>` query string (WebSocket upgrades)
 */
export function extractToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match?.[1]) return match[1];
  }
  const q = new URL(req.url).searchParams.get("token");
  return q && q.length > 0 ? q : null;
}

/** Constant-time string compare — avoids leaking length-prefix matches. */
export function tokensEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Authorize an operator request. Open when no `BACKBAR_TOKEN` is configured;
 * otherwise the request must carry a matching token.
 */
export function isAuthorized(req: Request): boolean {
  const expected = process.env.BACKBAR_TOKEN;
  if (!expected) return true;
  const got = extractToken(req);
  return got != null && tokensEqual(got, expected);
}
