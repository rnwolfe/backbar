import { useStore } from "../store/useStore";

export function Shopping() {
  const shopping = useStore((s) => s.shopping);

  return (
    <section className="h-full overflow-hidden flex flex-col">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-bg-3">
        <h1 className="text-sm font-medium">Shopping</h1>
        <span className="text-2xs text-fg-3">
          {shopping.low.length} low · {shopping.muse.length} muse
        </span>
      </header>
      <div className="overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-3 p-3">
        <div className="panel">
          <div className="row text-2xs uppercase tracking-wide text-fg-3 bg-bg-3/40">
            Low stock
          </div>
          {shopping.low.length === 0 ? (
            <div className="p-4 text-sm text-fg-3">Nothing low. Pour generously.</div>
          ) : (
            shopping.low.map((b) => {
              const pct = b.full_ml ? (b.level_ml / b.full_ml) * 100 : 0;
              return (
                <div key={b.id} className="row">
                  <span className="font-medium flex-1 truncate">
                    {b.product?.name ?? b.product_id}
                  </span>
                  <span className="font-mono text-2xs text-warn">
                    {Math.round(pct)}%
                  </span>
                  <span className="font-mono text-2xs text-fg-3 w-24 text-right">
                    {Math.round(b.level_ml)}/{b.full_ml} ml
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="panel">
          <div className="row text-2xs uppercase tracking-wide text-fg-3 bg-bg-3/40">
            Muse — unlock if you bought
          </div>
          {shopping.muse.length === 0 ? (
            <div className="p-4 text-sm text-fg-3">
              No one-away recipes — your bar is broad.
            </div>
          ) : (
            shopping.muse.map((m) => (
              <div key={m.product.id} className="row">
                <span className="font-medium flex-1 truncate">
                  {m.product.name ?? m.product.id}
                </span>
                <span className="font-mono text-2xs text-accent">
                  +{m.unlocks.length}
                </span>
                <span className="text-2xs text-fg-3 truncate max-w-[55%]">
                  {m.unlocks.slice(0, 3).join(", ")}
                  {m.unlocks.length > 3 ? "…" : ""}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
