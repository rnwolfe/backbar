import { useMemo } from "react";
import { useStore } from "../store/useStore";

export function Recipes() {
  const recipes = useStore((s) => s.recipes);
  const makeable = useStore((s) => s.makeable);

  const stateById = useMemo(
    () => new Map(makeable.map((m) => [m.recipe_id, m.state])),
    [makeable],
  );

  return (
    <section className="h-full overflow-hidden flex flex-col">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-bg-3">
        <h1 className="text-sm font-medium">Recipes</h1>
        <span className="text-2xs text-fg-3">{recipes.length}</span>
      </header>
      <div className="overflow-y-auto">
        {recipes.length === 0 ? (
          <div className="p-6 text-sm text-fg-3">No recipes yet — seed canon.</div>
        ) : (
          recipes.map((r) => {
            const st = stateById.get(r.id);
            const dot =
              st === "makeable" ? "bg-ok" : st === "one-away" ? "bg-warn" : "bg-fg-3";
            return (
              <div key={r.id} className="row row-hover">
                <span className={`inline-block w-2 h-2 rounded-full ${dot}`} aria-hidden />
                <span className="font-medium flex-1 truncate">{r.name}</span>
                {r.family ? <span className="pill">{r.family}</span> : null}
                {r.method ? <span className="pill">{r.method}</span> : null}
                {r.is_published ? (
                  <span className="pill text-accent border-accent/40">pub</span>
                ) : null}
                <span className="text-2xs text-fg-3 w-40 text-right truncate">
                  {r.glass ?? "—"}
                  {r.ice ? ` · ${r.ice}` : ""}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
