import type { Bottle } from "@backbar/core";

// Starter inventory: one open bottle per product in `CANON_PRODUCTS`. IDs are
// deterministic (`bottle-<product-id>`) so reseed is idempotent and so an
// operator wiping the bar and reseeding gets the same predictable handles.
//
// All bottles are `tracked:false` — the dev seed assumes no weight hardware
// (P0/P1). Once a load-cell is calibrated, the operator flips `tracked` on
// the bottle and channel mapping via the Bottles view.

interface StarterBottle {
  product_id: string;
  full_ml: number;
  level_ml: number;
}

const STARTER: StarterBottle[] = [
  // Spirits — mostly healthy, varied levels so the UI has texture.
  { product_id: "buffalo-trace", full_ml: 750, level_ml: 650 },
  { product_id: "rittenhouse-rye", full_ml: 750, level_ml: 720 },
  { product_id: "tanqueray", full_ml: 750, level_ml: 480 },
  { product_id: "bacardi-superior", full_ml: 750, level_ml: 600 },
  { product_id: "appleton-estate-reserve", full_ml: 750, level_ml: 580 },
  { product_id: "smith-and-cross", full_ml: 750, level_ml: 690 },
  { product_id: "cruzan-blackstrap", full_ml: 750, level_ml: 700 },
  { product_id: "espolon-blanco", full_ml: 750, level_ml: 540 },
  { product_id: "absinthe", full_ml: 750, level_ml: 720 },

  // Liqueurs / amari / vermouth.
  { product_id: "cointreau", full_ml: 750, level_ml: 620 },
  { product_id: "campari", full_ml: 750, level_ml: 670 },
  { product_id: "orange-curacao", full_ml: 750, level_ml: 410 },
  { product_id: "carpano-antica", full_ml: 750, level_ml: 450 },
  { product_id: "dolin-dry", full_ml: 750, level_ml: 510 },

  // Modifiers / syrups / bitters.
  { product_id: "simple-syrup", full_ml: 500, level_ml: 380 },
  { product_id: "orgeat", full_ml: 375, level_ml: 220 },
  { product_id: "angostura-bitters", full_ml: 200, level_ml: 130 },
  { product_id: "peychauds-bitters", full_ml: 148, level_ml: 95 },

  // Citrus & juice (fresh — these are the obvious replenish lines).
  { product_id: "lime-juice", full_ml: 500, level_ml: 220 },
  { product_id: "lemon-juice", full_ml: 500, level_ml: 280 },
  { product_id: "pineapple-juice", full_ml: 1000, level_ml: 350 },
];

export const STARTER_BOTTLES: readonly Bottle[] = STARTER.map(
  (b): Bottle => ({
    id: `bottle-${b.product_id}`,
    product_id: b.product_id,
    slot: null,
    tare_g: null,
    full_ml: b.full_ml,
    level_ml: b.level_ml,
    status: "open",
    tracked: false,
    opened_at: null,
    purchased_at: null,
    price_cents: null,
  }),
);
