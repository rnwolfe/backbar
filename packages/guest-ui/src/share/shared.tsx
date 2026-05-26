/**
 * Shared chrome + fetcher for the public share cards. Each card hits
 * `GET /api/guest/<kind>/:id` (proxied to the Bun server in dev or fronted
 * by Caddy in prod) and renders an editorial, mobile-first card.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface FetchState<T> {
  status: "loading" | "ready" | "error";
  data?: T;
  error?: string;
}

export function useShareResource<T>(path: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetch(path, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`${res.status}`);
        }
        return (await res.json()) as T;
      })
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          error: err instanceof Error ? err.message : "fetch failed",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return state;
}

export function ShareShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-5 pb-24 pt-10 sm:pt-16">
      <header className="text-center">
        <p className="small-caps">{eyebrow}</p>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl tracking-tight">{title}</h1>
        <div className="editorial-rule mx-auto mt-5" aria-hidden />
        {subtitle ? (
          <p className="mt-5 font-display italic text-ink-2 text-lg">{subtitle}</p>
        ) : null}
      </header>
      <main className="mt-12">{children}</main>
      <footer className="mt-16 border-t border-rule pt-6 text-center small-caps">
        <Link to="/" className="hover:text-ink-2">Back to menu</Link>
      </footer>
    </div>
  );
}

export function ShareLoading() {
  return (
    <div className="mx-auto max-w-2xl px-5 pt-16 text-center">
      <p className="text-ink-3">Pulling that up…</p>
    </div>
  );
}

export function ShareNotFound({ kind, id }: { kind: string; id: string }) {
  return (
    <div className="mx-auto max-w-2xl px-5 pt-16 text-center">
      <p className="small-caps">Not found</p>
      <h1 className="mt-2 font-display text-3xl">No {kind} called "{id}"</h1>
      <p className="mt-5 text-ink-3">
        The link might be from an older menu, or the bar might have rearranged its shelves.
      </p>
      <p className="mt-8">
        <Link to="/" className="small-caps hover:text-ink-2">
          Back to menu
        </Link>
      </p>
    </div>
  );
}
