/**
 * Starter category palette — installed on first DB seed. Operators edit /
 * add / delete categories from Settings; the palette is just defaults so
 * a freshly migrated DB has sensible swatches for every canon product.
 *
 * `hue` is an HSL hue (0–360); the Console renders `hsl(${hue} 60% 55%)`
 * for category dots and rail accents. `sort_order` controls display order.
 */
export interface StarterCategory {
  id: string;
  label: string;
  hue: number;
  sort_order: number;
}

export const STARTER_CATEGORIES: readonly StarterCategory[] = [
  { id: "gin", label: "Gin", hue: 178, sort_order: 10 },
  { id: "bourbon", label: "Bourbon", hue: 30, sort_order: 20 },
  { id: "rye", label: "Rye", hue: 18, sort_order: 30 },
  { id: "scotch", label: "Scotch", hue: 38, sort_order: 40 },
  { id: "rum", label: "Rum", hue: 14, sort_order: 50 },
  { id: "tequila", label: "Tequila", hue: 84, sort_order: 60 },
  { id: "mezcal", label: "Mezcal", hue: 42, sort_order: 70 },
  { id: "brandy", label: "Brandy", hue: 22, sort_order: 80 },
  { id: "absinthe", label: "Absinthe", hue: 120, sort_order: 90 },
  { id: "amaro", label: "Amaro", hue: 355, sort_order: 100 },
  { id: "vermouth", label: "Vermouth", hue: 340, sort_order: 110 },
  { id: "liqueur", label: "Liqueur", hue: 300, sort_order: 120 },
  { id: "bitters", label: "Bitters", hue: 8, sort_order: 130 },
  { id: "syrup-simple", label: "Simple Syrup", hue: 48, sort_order: 140 },
  { id: "syrup-rich", label: "Rich Syrup", hue: 48, sort_order: 150 },
  { id: "syrup", label: "Syrup", hue: 48, sort_order: 160 },
  { id: "citrus", label: "Citrus", hue: 62, sort_order: 170 },
  { id: "juice", label: "Juice", hue: 70, sort_order: 180 },
  { id: "spirit", label: "Spirit", hue: 200, sort_order: 200 },
];
