import { useMemo, useState } from "react";
import { useStore } from "../store/useStore";

type Filter = "all" | "makeable" | "one-away" | "unmakeable";

const stateColor = {
  makeable: "text-ok border-ok/40",
  "one-away": "text-warn border-warn/40",
  unmakeable: "text-fg-3 border-bg-3",
} as const;

export function Makeability() {
  const makeable = useStore((s) => s.makeable);
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c = { makeable: 0, "one-away": 0, unmakeable: 0 };
    for (const m of makeable) c[m.state] += 1;
    return c;
  }, [makeable]);

  const rows = useMemo(
    () => (filter === "all" ? makeable : makeable.filter((m) => m.state === filter)),
    [makeable, filter],
  );

  return (
    <section className="h-full overflow-hidden flex flex-col">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-bg-3">
        <h1 className="text-sm font-medium">Makeability</h1>
        <div className="ml-auto flex items-center gap-1.5">
          {(["all", "makeable", "one-away", "unmakeable"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`btn ${filter === f ? "border-accent text-accent" : ""}`}
            >
              {f}
              {f !== "all" ? (
                <span className="ml-1 font-mono text-2xs text-fg-3">
                  {counts[f as keyof typeof counts]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </header>
      <div className="overflow-y-auto">
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-fg-3">No recipes match this filter.</div>
        ) : (
          rows.map((m) => (
            <div key={m.recipe_id} className="row row-hover">
              <span
                className={`pill ${stateColor[m.state]} font-mono`}
                title={m.state}
              >
                {m.state}
              </span>
              <span className="font-medium truncate flex-1">{m.recipe.name}</span>
              <span className="text-2xs text-fg-3 truncate hidden md:inline">
                {m.recipe.family ?? "—"}
                {m.recipe.glass ? ` · ${m.recipe.glass}` : ""}
              </span>
              {m.missing.length > 0 ? (
                <span className="text-2xs text-warn truncate max-w-[40%]">
                  missing: {m.missing.join(", ")}
                </span>
              ) : (
                <span className="text-2xs text-fg-3">
                  {m.bindings.length} bottles
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
