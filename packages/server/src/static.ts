/**
 * Static SPA serving for the production surfaces.
 *
 * In prod the same Bun process that runs the API also serves the two built
 * Vite bundles (operator + guest). Each surface points at a `dist/` dir via an
 * env var; when that var is unset (dev, tests) the server never touches the
 * filesystem and falls back to the API. See `serve.ts` for host routing.
 *
 * SPA semantics: a request for an asset that exists on disk is served directly;
 * a request for an extension-less path (a client route like `/recipes`) is
 * served `index.html` so the React router can take over.
 */
import { join, normalize } from "node:path";

export interface StaticSurface {
  /** Absolute path to the built bundle, or undefined to disable (dev). */
  dist: string | undefined;
}

/** Resolve the operator + guest dist dirs from the environment (prod-only). */
export function staticSurfacesFromEnv(): { operator: StaticSurface; guest: StaticSurface } {
  return {
    operator: { dist: process.env.BACKBAR_OPERATOR_DIST || undefined },
    guest: { dist: process.env.BACKBAR_GUEST_DIST || undefined },
  };
}

/**
 * Serve a static file for `pathname` out of `dist`, with SPA fallback.
 * Returns `null` when no dist is configured (caller should fall through to the
 * API) or when an asset-looking path genuinely doesn't exist (a real 404).
 */
export async function serveStatic(
  surface: StaticSurface,
  pathname: string,
): Promise<Response | null> {
  const dist = surface.dist;
  if (!dist) return null;

  // Block path traversal: normalize and reject anything escaping the root.
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidate = rel === "/" || rel === "" ? "index.html" : rel.replace(/^\/+/, "");

  const file = Bun.file(join(dist, candidate));
  if (await file.exists()) {
    return new Response(file);
  }

  // Extension-less path → SPA route → serve the shell so the router resolves it.
  const looksLikeAsset = /\.[a-z0-9]+$/i.test(candidate);
  if (!looksLikeAsset) {
    const shell = Bun.file(join(dist, "index.html"));
    if (await shell.exists()) {
      return new Response(shell, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
  }

  return new Response("Not Found", { status: 404 });
}
