/**
 * Compute a public share URL for a recipe / product / bottle.
 *
 * The base URL resolves in this order:
 *   1. `VITE_GUEST_BASE_URL` baked into the build (set this for prod
 *      deploys so share URLs point at your real public origin).
 *   2. Same host as the operator UI, port 5174 — matches the guest-ui
 *      Vite dev server. Works on a LAN out of the box.
 *
 * Returned URLs are absolute so they can be pasted into chat / SMS.
 */
declare global {
  interface ImportMetaEnv {
    readonly VITE_GUEST_BASE_URL?: string;
  }
}

export function guestBaseUrl(): string {
  const env = import.meta.env.VITE_GUEST_BASE_URL;
  if (env) return env.replace(/\/+$/, "");
  if (typeof window === "undefined") return "http://localhost:5174";
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:5174`;
}

export type ShareKind = "recipe" | "product" | "bottle";

const PATH: Record<ShareKind, string> = {
  recipe: "r",
  product: "p",
  bottle: "b",
};

export function shareUrl(kind: ShareKind, id: string): string {
  return `${guestBaseUrl()}/${PATH[kind]}/${encodeURIComponent(id)}`;
}

/**
 * Copy `text` to the clipboard. Falls back to a hidden textarea + execCommand
 * for insecure-context dev (HTTP over LAN). Returns true on success.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const nav = navigator as Navigator & { clipboard?: { writeText(s: string): Promise<void> } };
  if (nav.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to legacy path */
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
