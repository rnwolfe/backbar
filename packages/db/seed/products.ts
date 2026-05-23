import type { Product } from "@backbar/core";

// Layer-1 starter catalog. Every ingredient referenced by `CANON_RECIPES` is
// satisfied by a product here — either by exact id (product refs), by category
// (bourbon / rye / gin), or by a `flavor_tags` entry (white-rum, sweet-vermouth,
// lime, …). Product brands are illustrative; we seed *real* SKUs only because
// dev data is more useful when it looks like a bar, not "Spirit A / Spirit B".
//
// Densities follow §6 category defaults (see @backbar/core DENSITY_BY_CATEGORY);
// we only override density_g_ml on the cordials where the default would be wrong.

export const CANON_PRODUCTS: readonly Product[] = [
  // ── whiskey ─────────────────────────────────────────────────────────────
  {
    id: "buffalo-trace",
    name: "Buffalo Trace",
    category: "bourbon",
    subcategory: "kentucky-straight",
    abv: 0.45,
    default_ml: 750,
    flavor_tags: ["bourbon", "caramel", "vanilla"],
    notes: "Workhorse bourbon — old fashioned / whiskey sour default.",
  },
  {
    id: "rittenhouse-rye",
    name: "Rittenhouse Rye Bottled-in-Bond",
    category: "rye",
    subcategory: "bottled-in-bond",
    abv: 0.5,
    default_ml: 750,
    flavor_tags: ["rye", "spice"],
    notes: "100-proof rye — Manhattan / Sazerac standard.",
  },

  // ── gin ────────────────────────────────────────────────────────────────
  {
    id: "tanqueray",
    name: "Tanqueray London Dry",
    category: "gin",
    subcategory: "london-dry",
    abv: 0.4724,
    default_ml: 750,
    flavor_tags: ["gin", "juniper", "citrus"],
    notes: "Backbone gin for Negroni / Martini / Gimlet.",
  },

  // ── rum ────────────────────────────────────────────────────────────────
  {
    id: "bacardi-superior",
    name: "Bacardi Superior",
    category: "spirit",
    subcategory: "rum",
    abv: 0.4,
    default_ml: 750,
    flavor_tags: ["white-rum", "rum"],
  },
  {
    id: "appleton-estate-reserve",
    name: "Appleton Estate Reserve",
    category: "spirit",
    subcategory: "rum",
    abv: 0.4,
    default_ml: 750,
    flavor_tags: ["aged-rum", "jamaican-rum", "rum"],
    notes: "Doubles as the Jamaican / aged rum in a Mai Tai if Smith & Cross runs out.",
  },
  {
    id: "smith-and-cross",
    name: "Smith & Cross Traditional Jamaica Rum",
    category: "spirit",
    subcategory: "rum",
    abv: 0.57,
    default_ml: 750,
    flavor_tags: ["jamaican-rum", "rum", "funk"],
  },
  {
    id: "cruzan-blackstrap",
    name: "Cruzan Black Strap Rum",
    category: "spirit",
    subcategory: "rum",
    abv: 0.4,
    default_ml: 750,
    flavor_tags: ["blackstrap-rum", "rum", "molasses"],
  },

  // ── tequila ────────────────────────────────────────────────────────────
  {
    id: "espolon-blanco",
    name: "Espolòn Blanco",
    category: "spirit",
    subcategory: "tequila",
    abv: 0.4,
    default_ml: 750,
    flavor_tags: ["blanco-tequila", "tequila", "agave"],
  },

  // ── liqueurs & amari ──────────────────────────────────────────────────
  {
    id: "cointreau",
    name: "Cointreau",
    category: "liqueur",
    subcategory: "orange",
    abv: 0.4,
    default_ml: 750,
    flavor_tags: ["orange-liqueur", "triple-sec"],
  },
  {
    id: "campari",
    name: "Campari",
    category: "amaro",
    subcategory: "aperitivo",
    abv: 0.24,
    default_ml: 750,
    flavor_tags: ["bitter", "aperitivo"],
  },
  {
    id: "orange-curacao",
    name: "Pierre Ferrand Dry Curaçao",
    category: "liqueur",
    subcategory: "orange",
    abv: 0.4,
    default_ml: 750,
    flavor_tags: ["orange-liqueur", "curacao"],
    notes: "Slug = recipe-canonical id; Mai Tai calls for `orange-curacao` directly.",
  },
  {
    id: "orgeat",
    name: "Small Hand Foods Orgeat",
    category: "syrup-rich",
    subcategory: "nut",
    density_g_ml: 1.3,
    default_ml: 375,
    flavor_tags: ["almond", "nut"],
  },

  // ── vermouth ───────────────────────────────────────────────────────────
  {
    id: "carpano-antica",
    name: "Carpano Antica Formula",
    category: "vermouth",
    subcategory: "sweet",
    abv: 0.165,
    default_ml: 750,
    flavor_tags: ["sweet-vermouth", "vanilla"],
  },
  {
    id: "dolin-dry",
    name: "Dolin Dry Vermouth de Chambéry",
    category: "vermouth",
    subcategory: "dry",
    abv: 0.175,
    default_ml: 750,
    flavor_tags: ["dry-vermouth"],
  },

  // ── modifiers, bitters, syrup ─────────────────────────────────────────
  {
    id: "simple-syrup",
    name: "Simple syrup (1:1)",
    category: "syrup-simple",
    density_g_ml: 1.22,
    default_ml: 500,
    flavor_tags: ["syrup"],
    notes: "House-made 1:1 — recipe-canonical id `simple-syrup`.",
  },
  {
    id: "angostura-bitters",
    name: "Angostura Aromatic Bitters",
    category: "bitters",
    abv: 0.448,
    default_ml: 200,
    flavor_tags: ["bitters", "aromatic"],
  },
  {
    id: "peychauds-bitters",
    name: "Peychaud's Bitters",
    category: "bitters",
    abv: 0.35,
    default_ml: 148,
    flavor_tags: ["bitters", "anise"],
  },
  {
    id: "absinthe",
    name: "St. George Absinthe Verte",
    category: "spirit",
    subcategory: "absinthe",
    abv: 0.6,
    default_ml: 750,
    flavor_tags: ["absinthe", "anise"],
  },

  // ── citrus & juice (fresh, treated as bottle-tracked for the dev seed) ─
  {
    id: "lime-juice",
    name: "Fresh lime juice",
    category: "citrus",
    default_ml: 500,
    flavor_tags: ["lime", "citrus"],
    notes: "Stand-in for daily-squeezed lime — replenished in real bars.",
  },
  {
    id: "lemon-juice",
    name: "Fresh lemon juice",
    category: "citrus",
    default_ml: 500,
    flavor_tags: ["lemon", "citrus"],
  },
  {
    id: "pineapple-juice",
    name: "Pineapple juice",
    category: "juice",
    default_ml: 1000,
    flavor_tags: ["pineapple", "juice"],
  },
];
