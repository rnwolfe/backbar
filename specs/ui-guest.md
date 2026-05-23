# specs/ui-guest.md

Detail for `packages/guest-ui`. Parent: spec §5. A separate Vite build from the operator console; **shares design tokens, not layout or aesthetic.** Where the operator console is a dense industrial control panel, the guest menu is editorial and unhurried — it's the one surface a guest sees.

---

## 1. What it shows

Read-only projection from `GET /api/guest/menu` (api.md §6) — the minimal public shape only:
```
{ name, family, glass, ice, garnish, instructions, tags }[]
```
**No levels, no products, no bottle/inventory data ever reaches this build.** Privacy is structural: the guest endpoint can't return inventory because it isn't in the response shape.

A recipe appears iff `is_published === true` AND it is currently `makeable`. The makeability filter happens server-side; the guest UI just renders what it's given. When a key bottle runs dry, the drink drops off the menu (snapshot) or greys with a subtle "86'd" treatment (Caddy/live mode, where state can update without a rebuild).

---

## 2. Serve modes (config; see api.md §6)

**Snapshot (default).** `POST /menu/publish` builds static assets and pushes to Vercel. Fully decoupled from the home box; shareable URL; nothing of the home network exposed. Regenerated on publish or when a `makeable.changed` flips a published recipe (debounced). Best when guests scan a QR from anywhere or you want a stable link.

**Caddy live.** `guest-ui/dist` served from the home box behind Caddy, fetching `GET /api/guest/menu` live. No publish step; the menu reflects inventory in real time (86'd drinks update on a poll/WS). Caddy fronts only `/api/guest/*` + static files; the operator API stays unexposed. Best for in-house only.

The build is identical; mode is a runtime data-source switch (`__SNAPSHOT__` baked JSON vs live fetch).

---

## 3. Information architecture

- **Cover** — bar name / wordmark, a line of standing, the date. Optional: "X drinks tonight."
- **Menu** — grouped by `family` or `tags` (house sections like "Stirred & Spirit-Forward", "Bright & Sour", "Long & Refreshing"). Each entry: name, a one-line description (from `instructions` or a short blurb), and the serving cues (glass · ice · garnish) set small.
- **Detail** (tap/expand) — fuller description; method as prose, never a parts list with measurements (guests don't need the build, and it keeps your specs yours).
- **Optional "I'll have this"** (P3) — posts a pour intent back to the operator (`POST /api/guest/order {recipe_id}`), surfaced on the console as a ticket. Off by default.

---

## 4. Makeability-aware rendering

- Snapshot: unmakeable published recipes are simply absent from the build.
- Live: render all published; apply a muted, struck "currently unavailable" style to ones whose `state !== makeable`. Never show *why* (no "out of Campari") — just unavailable.

---

## 5. Design direction

Distinct from the operator console by intent. Suggested: editorial/print-menu — a refined serif at display sizes, generous margins, restrained palette (warm paper or deep low-light bar tones), one accent. Mobile-first (guests are on phones, scanning a QR). Shares only the **tokens** (`--copper`, type scale) with the operator build so they feel like one brand without looking like the same screen.

Avoid: dashboard chrome, data density, anything that reads as "admin." This page should feel like a thing a bar would print, not a tool.

---

## Boundaries
- Guest build imports nothing from `server` internals — only the public `/api/guest/*` contract.
- No secrets, no inventory, no AI calls client-side.
- Operator API is never reachable from the guest origin (Caddy path scoping; or full origin separation in snapshot mode).
