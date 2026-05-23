import { useMemo, useState } from "react";
import type { Recipe } from "@backbar/core";
import { api, type MakeableItem } from "../api/client";
import { useStore } from "../store/useStore";

interface Props {
  recipe: Recipe & { makeable?: MakeableItem };
  onClose(): void;
  onToast(text: string): void;
}

/**
 * Two-step argKind flow tail: `recipe.log-pour` → pick recipe → this form.
 * Bindings are prefilled from cached `/makeable`; the operator can tweak
 * `ml` per binding before committing. POST /pour normalizes the merged
 * bindings server-side; the server then emits `reading.updated` etc.
 */
export function PourConfirm({ recipe, onClose, onToast }: Props) {
  const bottles = useStore((s) => s.bottles);
  const makeable = useStore((s) => s.makeable);
  const item = useMemo(
    () =>
      recipe.makeable ?? makeable.find((m) => m.recipe_id === recipe.id),
    [recipe, makeable],
  );

  const initial = useMemo(
    () =>
      (item?.bindings ?? []).map((b) => ({
        ref: b.ref,
        bottle_id: b.bottle_id,
        ml: b.ml,
      })),
    [item],
  );
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);

  if (!item || item.state !== "makeable") {
    return (
      <div className="p-6 text-sm">
        <div className="text-fg font-medium">{recipe.name}</div>
        <div className="mt-2 text-danger">
          Not currently makeable
          {item?.missing.length ? <> — missing: {item.missing.join(", ")}</> : null}.
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </div>
    );
  }

  const bottleLabel = (id: string) => {
    const b = bottles.find((x) => x.id === id);
    if (!b) return id;
    return `${b.product?.name ?? b.product_id} (${Math.round(b.level_ml)} ml)`;
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.pour({
        recipe_id: recipe.id,
        overrides: rows.filter((r) => r.ml > 0),
      });
      onToast(`pour logged: ${recipe.name}`);
      onClose();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "pour failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm text-fg-3 uppercase tracking-wide">Log pour</div>
          <div className="text-lg font-medium">{recipe.name}</div>
        </div>
        <div className="flex items-center gap-2 text-2xs">
          {recipe.family ? <span className="pill">{recipe.family}</span> : null}
          {recipe.glass ? <span className="pill">{recipe.glass}</span> : null}
          {recipe.ice ? <span className="pill">{recipe.ice}</span> : null}
        </div>
      </div>

      <div className="mt-3 border border-bg-3 rounded">
        <div className="row text-2xs uppercase tracking-wide text-fg-3 bg-bg-3/40">
          <div className="w-40">Ingredient</div>
          <div className="flex-1">Bottle</div>
          <div className="w-24 text-right">ml</div>
        </div>
        {rows.length === 0 ? (
          <div className="row text-fg-3 text-sm">No depletable bindings.</div>
        ) : (
          rows.map((r, i) => (
            <div key={`${r.ref}-${i}`} className="row text-sm">
              <div className="w-40 font-mono text-2xs text-fg-2">{r.ref}</div>
              <div className="flex-1 truncate">{bottleLabel(r.bottle_id)}</div>
              <input
                className="input w-24 text-right font-mono"
                type="number"
                min={0}
                value={r.ml}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setRows((prev) =>
                    prev.map((row, idx) =>
                      idx === i ? { ...row, ml: Number.isFinite(v) ? v : 0 } : row,
                    ),
                  );
                }}
              />
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={onClose} type="button">
          Cancel
        </button>
        <button
          className="btn border-accent text-accent disabled:opacity-50"
          onClick={submit}
          disabled={busy}
          type="button"
        >
          {busy ? "Logging…" : "Log pour"}
        </button>
      </div>
    </div>
  );
}
