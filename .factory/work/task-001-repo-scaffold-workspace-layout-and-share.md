---
id: task-001
title: Repo scaffold, workspace layout, and shared core types
status: ready
priority: med
estimate: medium
created: 2026-05-23T03:32:27.013Z
updated: 2026-05-23T03:32:27.013Z
---

## Acceptance

- [ ] Bun + TypeScript strict workspace exists with packages/core, packages/db, packages/server, packages/operator-ui, packages/guest-ui, packages/firmware per §7
- [ ] packages/core is pure/IO-free and exports Zod schemas for product, bottle, reading, recipe, recipe_ingredient, pour, sensor_channel, node matching §1
- [ ] Unit/density conversion and balance math helpers in packages/core have unit tests per §6 and execution notes
- [ ] AGENTS.md, specs/, and .env.example (AI_GATEWAY_API_KEY, MQTT_URL, webhook config, hmac secret) are present per §7

## Notes

(agent-maintained)

### Done — 2026-05-22

- Workspace: bun workspaces in root `package.json`; members = `packages/{core,db,server,operator-ui,guest-ui}`. `firmware` is a PlatformIO C++ project, not a JS workspace (correct per §7).
- TS: `tsconfig.base.json` (strict + `noUncheckedIndexedAccess` + `noImplicitOverride`). Per-package `tsconfig.json` extends base with `noEmit: true` — packages export from `./src/index.ts` directly, no dist build needed for internal consumption. Root `tsconfig.json` glob-includes all `packages/*/src` and core/test for a single `tsc --noEmit` pass.
- `packages/core` is pure (no `bun:*`, no `fs`, no `fetch`):
  - `src/schema.ts` — Zod for Product, Bottle, Reading, Recipe, RecipeIngredient, Pour, SensorChannel, Node, plus Balance, ManualReading, WeightReading. Enums Source/Status/RefType/Unit/Method exported.
  - `src/units.ts` — `toMl()`, `density()` (with high-proof spirit fork at abv≥0.5), `gramsToMl()`/`mlToGrams()`, `UNIT_ML`, `DENSITY_BY_CATEGORY`, `NON_DEPLETING`.
  - `src/balance.ts` — `METHOD_DILUTION`, `finalAbv()`, `finalVolumeMl()`, `aggregateBalance()`, `balanceFlags()` (too_hot / too_watery). Liquid-Intelligence-style dilution factors per method.
  - `src/makeability.ts` — `evaluate()` with product/category/tag/freeform resolution, one-away/unmakeable state machine, use-it-up vs freshest binding policy. `coverage()` for shopping-muse ranking.
- Tests (Bun test, 60 passing): units (15), balance (15), makeability (13), schema (12). Cover dash/barspoon/top conversion, non-depleting units, density fork, ABV math, dilution, axis aggregation, ref_type resolution, state transitions, binding policy, coverage ranking.
- specs/ copied to repo root from `docs/internal/{SPEC.md,specs/*}` with conventional naming (`backbar-architecture-spec.md`, `data-model.md`, `api.md`, `ai-engine.md`, `ui-guest.md`). The `docs/internal/` originals are kept as the spec-import artifact.
- `.env.example` covers AI_GATEWAY_API_KEY, MQTT_URL, HMAC_SECRET, WEBHOOK_*, PORT, DATABASE_URL, VERCEL_*, VA_ABC_ENABLED.

### Acceptance check

- [x] Bun + TS strict workspace with all six packages per §7
- [x] `packages/core` pure/IO-free; Zod for product, bottle, reading, recipe, recipe_ingredient, pour, sensor_channel, node
- [x] Unit/density + balance helpers with passing unit tests
- [x] AGENTS.md, specs/, .env.example present per §7

### Verification

```
$ bun install               # 12 packages
$ bunx tsc --noEmit         # clean
$ bun test                  # 60 pass / 0 fail across 4 files
```

