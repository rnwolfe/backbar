import { useStore } from "../store/useStore";

function LevelBar({ pct, low }: { pct: number; low: boolean }) {
  const color = low ? "bg-warn" : "bg-accent-2";
  return (
    <div className="h-1.5 w-24 rounded bg-bg-3 overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

export function Bottles() {
  const bottles = useStore((s) => s.bottles);

  return (
    <section className="h-full overflow-hidden flex flex-col">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-bg-3">
        <h1 className="text-sm font-medium">Bottles</h1>
        <span className="text-2xs text-fg-3">{bottles.length}</span>
      </header>
      <div className="overflow-y-auto">
        {bottles.length === 0 ? (
          <div className="p-6 text-sm text-fg-3">No bottles registered.</div>
        ) : (
          bottles.map((b) => {
            const pct = b.full_ml ? (b.level_ml / b.full_ml) * 100 : 0;
            const low = pct < 15;
            return (
              <div key={b.id} className="row row-hover">
                <span className="font-medium truncate flex-1">
                  {b.product?.name ?? b.product_id}
                </span>
                <LevelBar pct={pct} low={low} />
                <span className="w-24 text-right font-mono text-2xs text-fg-2">
                  {Math.round(b.level_ml)}/{b.full_ml}
                </span>
                <span className="pill">{b.status}</span>
                {b.tracked ? (
                  <span className="pill text-accent border-accent/40">weight</span>
                ) : (
                  <span className="pill">manual</span>
                )}
                {b.slot ? (
                  <span className="text-2xs font-mono text-fg-3 w-20 text-right truncate">
                    {b.slot}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
