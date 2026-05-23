import { useStore } from "../store/useStore";

export function Catalog() {
  const products = useStore((s) => s.products);

  return (
    <section className="h-full overflow-hidden flex flex-col">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-bg-3">
        <h1 className="text-sm font-medium">Catalog</h1>
        <span className="text-2xs text-fg-3">{products.length} products</span>
      </header>
      <div className="overflow-y-auto">
        {products.length === 0 ? (
          <div className="p-6 text-sm text-fg-3">No products yet — seed canon or add one.</div>
        ) : (
          products.map((p) => (
            <div key={p.id} className="row row-hover">
              <span className="font-medium flex-1 truncate">{p.name}</span>
              <span className="pill">{p.category}</span>
              {p.subcategory ? <span className="pill">{p.subcategory}</span> : null}
              <span className="text-2xs font-mono text-fg-3 w-20 text-right">
                {p.abv != null ? `${Math.round(p.abv * 100)}%` : "—"}
              </span>
              <span className="text-2xs font-mono text-fg-3 w-12 text-right">
                {p.id}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
