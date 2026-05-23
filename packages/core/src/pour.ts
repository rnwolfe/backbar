import type { Bottle, PourBinding } from "./schema";

/**
 * A bottle is "empty" once its remaining level falls at or below this
 * threshold (ml). Spec §5 says `flip status->empty if ~0` — we use a small
 * positive epsilon so unavoidable residue (drops on the dasher, last barspoon
 * left to honour a pour binding) doesn't strand a bottle at `level_ml > 0`
 * forever.
 */
export const EMPTY_THRESHOLD_ML = 5;

/**
 * Per-binding depletion result.
 *
 * `prev_ml` is what the latest reading said the bottle held; `new_ml` is what
 * the new pour reading must record. `flip_empty` is true when this pour drops
 * the bottle to/under the empty threshold (so the DB layer should flip
 * `bottle.status` to `'empty'`).
 */
export interface BottleDepletion {
  bottle_id: string;
  prev_ml: number;
  new_ml: number;
  ml: number;
  flip_empty: boolean;
}

/**
 * Pure depletion math — given current per-bottle levels and the bindings
 * recorded against a pour, compute the post-pour levels.
 *
 * - `ml: 0` bindings (non-depleting units; see §6) pass through with
 *   `new_ml === prev_ml`.
 * - Over-draw throws — callers that want partial fulfilment must clamp
 *   bindings before invoking. Pour math is exact per the binding.
 * - The function is total: every binding gets a result, including misses
 *   against `currentLevels`. A binding for an unknown bottle throws.
 */
export function depletePour(
  bindings: PourBinding[],
  currentLevels: ReadonlyMap<string, number>,
): BottleDepletion[] {
  const out: BottleDepletion[] = [];
  for (const b of bindings) {
    const prev = currentLevels.get(b.bottle_id);
    if (prev === undefined) {
      throw new Error(`unknown bottle in pour binding: ${b.bottle_id}`);
    }
    if (b.ml < 0) {
      throw new Error(`negative pour ml on bottle ${b.bottle_id}: ${b.ml}`);
    }
    if (b.ml > prev + 1e-6) {
      throw new Error(
        `over-draw on bottle ${b.bottle_id}: have ${prev} ml, requested ${b.ml} ml`,
      );
    }
    const next = prev - b.ml;
    out.push({
      bottle_id: b.bottle_id,
      prev_ml: prev,
      new_ml: next,
      ml: b.ml,
      flip_empty: b.ml > 0 && next <= EMPTY_THRESHOLD_ML,
    });
  }
  return out;
}

/** Returns the `status` the bottle should land in after a depletion. */
export function statusAfterDepletion(
  before: Bottle["status"],
  depletion: BottleDepletion,
): Bottle["status"] {
  if (depletion.flip_empty) return "empty";
  return before;
}
