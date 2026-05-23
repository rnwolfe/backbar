import { useStore } from "../store/useStore";

interface Props {
  onOpenPalette(): void;
}

export function TopBar({ onOpenPalette }: Props) {
  const conn = useStore((s) => s.conn);
  const onlineNodes = useStore((s) => s.nodes.filter((n) => n.status === "online").length);
  const totalNodes = useStore((s) => s.nodes.length);

  const dot =
    conn === "open" ? "bg-ok" : conn === "connecting" ? "bg-warn" : "bg-danger";

  return (
    <header className="flex items-center gap-3 border-b border-bg-3 bg-bg-2/80 backdrop-blur px-3 h-10 shrink-0">
      <div className="flex items-center gap-2">
        <div className="font-mono text-xs text-accent">▒</div>
        <div className="font-mono text-sm tracking-widest">BACKBAR</div>
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="ml-2 flex flex-1 items-center gap-2 max-w-xl rounded border border-bg-3 bg-bg/60 px-2 py-1 text-left text-sm text-fg-3 hover:border-bg-4"
        aria-label="open command palette"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <span className="kbd">⌘K</span>
        <span className="truncate">search bottles, recipes, commands…</span>
      </button>

      <div className="ml-auto flex items-center gap-3 text-2xs text-fg-3">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${dot}`} aria-hidden />
          <span className="font-mono uppercase tracking-wide">{conn}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono uppercase tracking-wide">nodes</span>
          <span className="font-mono text-fg-2">
            {onlineNodes}/{totalNodes}
          </span>
        </div>
      </div>
    </header>
  );
}
