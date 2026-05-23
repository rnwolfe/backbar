// Public menu shape mirrors api.md §6 / specs/ui-guest.md §1 exactly.
// The guest build NEVER sees `level_ml`, `bottles`, or product internals —
// privacy is structural: it isn't in the wire shape.
export interface MenuItem {
  name: string;
  family: string | null;
  glass: string | null;
  ice: string | null;
  garnish: string | null;
  instructions: string | null;
  tags: string[];
}

// In Caddy/live mode we let the server tell us which published items are
// currently unavailable (key bottle dry). The list-only `MenuItem[]` shape is
// "snapshot baked": already filtered to makeable. The richer wire shape with
// `available` flags is the live mode response.
export type GuestMenuPayload =
  | { mode: "snapshot"; items: MenuItem[] }
  | { mode: "live"; items: Array<MenuItem & { available: boolean }> };

export interface RenderedItem extends MenuItem {
  available: boolean;
}
