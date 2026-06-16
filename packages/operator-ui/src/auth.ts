/**
 * Operator token storage. The production server gates `/api/*` and `/live`
 * behind a shared bearer token (see packages/server/src/auth.ts). The operator
 * pastes it once; we keep it in localStorage and attach it to every request.
 *
 * In dev the server runs without a token, so an empty value here is harmless —
 * the header is simply omitted and everything stays open.
 */
const TOKEN_KEY = "backbar.token";

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Whether the server has actually challenged us (a 401 came back). The gate
 * only appears once this flips true, so a token-less dev server — which never
 * 401s — stays gate-free.
 */
let challenged = false;

export function isChallenged(): boolean {
  return challenged;
}

/** Called by the API/WS layer on a 401 — clears the bad token and opens the gate. */
export function markUnauthorized(): void {
  challenged = true;
  setToken("");
}

export function getToken(): string {
  if (typeof localStorage === "undefined") return "";
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Persistence is best-effort; the in-memory header still applies this run.
  }
  for (const fn of listeners) fn();
}

export function clearToken(): void {
  setToken("");
}

/** Subscribe to token changes (TokenGate re-renders when auth state flips). */
export function onTokenChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Auth header for fetch, or an empty object when no token is set. */
export function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}
