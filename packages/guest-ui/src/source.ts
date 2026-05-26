import type { GuestMenuPayload, MenuItem } from "./types";

/**
 * Where the guest UI gets its data — runtime switch, build is identical
 * (spec §2). In snapshot mode the build fetches a relative `./menu.json`
 * that publish wrote alongside the static assets. In Caddy/live mode the
 * build fetches `/api/guest/menu` through Caddy's reverse proxy (or the
 * Vite dev proxy in development).
 *
 * Default is "live" — dev works out of the box because the Vite proxy
 * forwards to the running Bun server. Production Vercel builds opt into
 * snapshot mode via `VITE_GUEST_MODE=snapshot` so the menu is baked into
 * the static bundle and served alongside it.
 */
export type SourceMode = "snapshot" | "live";

declare global {
  interface ImportMetaEnv {
    readonly VITE_GUEST_MODE?: SourceMode;
    readonly VITE_GUEST_MENU_URL?: string;
  }
}

export function resolveMode(): SourceMode {
  return (import.meta.env.VITE_GUEST_MODE as SourceMode | undefined) ?? "live";
}

export function resolveUrl(mode: SourceMode): string {
  if (import.meta.env.VITE_GUEST_MENU_URL) return import.meta.env.VITE_GUEST_MENU_URL;
  return mode === "snapshot" ? "./menu.json" : "/api/guest/menu";
}

/**
 * The server's `GET /guest/menu` returns a bare `MenuItem[]` today (§api.md
 * §6). We normalize both shapes to `GuestMenuPayload` so the UI doesn't care.
 */
export async function fetchMenu(mode: SourceMode = resolveMode()): Promise<GuestMenuPayload> {
  const res = await fetch(resolveUrl(mode), { cache: "no-store" });
  if (!res.ok) throw new Error(`menu fetch failed: ${res.status}`);
  const body = (await res.json()) as unknown;
  return normalizePayload(body, mode);
}

export function normalizePayload(body: unknown, mode: SourceMode): GuestMenuPayload {
  if (Array.isArray(body)) {
    const items = body as MenuItem[];
    if (mode === "live") {
      return { mode: "live", items: items.map((it) => ({ ...it, available: true })) };
    }
    return { mode: "snapshot", items };
  }
  if (body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items)) {
    const payload = body as GuestMenuPayload;
    return payload.mode === "live"
      ? { mode: "live", items: payload.items }
      : { mode: "snapshot", items: payload.items as MenuItem[] };
  }
  throw new Error("malformed guest menu payload");
}
