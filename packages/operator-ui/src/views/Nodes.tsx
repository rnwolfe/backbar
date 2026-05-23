import { useStore } from "../store/useStore";

function ago(ts: number | null | undefined) {
  if (!ts) return "—";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export function Nodes() {
  const nodes = useStore((s) => s.nodes);

  return (
    <section className="h-full overflow-hidden flex flex-col">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-bg-3">
        <h1 className="text-sm font-medium">Node health</h1>
        <span className="text-2xs text-fg-3">
          {nodes.filter((n) => n.status === "online").length}/{nodes.length} online
        </span>
      </header>
      <div className="overflow-y-auto">
        {nodes.length === 0 ? (
          <div className="p-6 text-sm text-fg-3">
            No fleet nodes registered (P0/P1 — software ships without hardware).
          </div>
        ) : (
          nodes.map((n) => (
            <div key={n.device_id} className="row row-hover">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  n.status === "online" ? "bg-ok" : "bg-danger"
                }`}
                aria-hidden
              />
              <span className="font-medium truncate flex-1">{n.label ?? n.device_id}</span>
              <span className="font-mono text-2xs text-fg-3 w-48 truncate">
                {n.device_id}
              </span>
              <span className="font-mono text-2xs text-fg-3 w-24 text-right">
                {n.fw_version ?? "—"}
              </span>
              <span className="font-mono text-2xs text-fg-3 w-24 text-right">
                {ago(n.last_seen)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
