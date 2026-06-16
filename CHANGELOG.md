# Changelog

All notable changes to Backbar are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and releases use conventional commits to determine the next pre-1.0 semver
version.

## [Unreleased]

## [0.1.0] - 2026-06-16

### Added

- **prod:** host-routed serving, operator token gate, and backbar ops CLI
- **release:** add conventional release workflow
- **bulk-import:** wire confirm step — readings, WS events, standard creation path
- **operator-ui:** bulk inventory import from shelf photos
- **server:** POST /inventory/import-photo-bulk — batch image import with catalog reconciliation
- **ai:** grounded lookup for inventory import candidates
- **ai:** inventory import vision schema + prompt + repair loop
- vision model evaluation and configurable model defaults for inventory import
- add 6 tasks from feature plan — Support bulk import of inventory from images (multiple at on
- **mobile:** per-screen responsive pass — rails collapse, grids stack
- **mobile:** responsive foundation — chrome, overlays, viewport hook
- **share:** public share URLs for recipes / products / bottles
- **pour:** manual log-a-shot — recipe-less pour from a single bottle
- **flags:** operator-toggleable feature flags + gate Shelf behind one
- **ui:** react-router-dom routing — refreshable URLs + deep-linked detail
- **categories:** registry table, CRUD route, Settings management UI
- operator console rewrite + product metadata/tags + telemetry/pours
- starter bar seed + admin reset endpoints + Settings view
- **task-008:** smart shelf P2a — MQTT subscriber, ESP32 firmware, 2-point calibration
- **guest-ui:** editorial menu build + snapshot/caddy publish modes (task-007)
- **server/ai:** add ratios field to GeneratedSpec (task-006)
- **operator-ui:** React+Vite+Tailwind dense dark console with ⌘K palette (task-005)
- **server:** Hono API, transport-agnostic ingest core, WS /live (task-004)
- **core,db:** pour depletion math and pours.apply() (task-003)
- **db:** bun:sqlite migrations, repositories, and canon seed (task-002)
- scaffold Bun + TS workspace with packages/core (task-001)

### Changed

- add project vision (factory plan #scbp8xba)
- **task-016:** Task 0015 did not fix the overflow problem.
- task-016 status -> done
- capture task-016 — Task 0015 did not fix the overflow problem.
- **task-015:** fix the mobile ui for bottles and catalog
- task-015 status -> done
- capture task-015 — fix the mobile ui for bottles and catalog
- **task-014:** Commit confirmed candidates to inventory
- task-014 status -> done
- **task-013:** Operator UI: multi-image upload + review/confirm screen
- task-013 status -> done
- **task-012:** Bulk import server endpoint + catalog reconciliation
- task-012 status -> done
- **task-011:** Web-grounded detail lookup (anti-hallucination enrichment)
- task-011 status -> done
- **task-010:** Define candidate Zod schema + vision prompt (observe, don't inve
- task-010 status -> done
- **task-009:** Evaluate + select the visual-reasoning + grounding model (cost/q
- task-009 status -> done
- task-009 model -> claude-sonnet-4-6
- task-009 model -> claude-opus-4-7
- task-009 model -> claude-opus-4-8
- task-009 model -> default
- task-009 model -> claude-sonnet-4-6
- **readme:** rewrite for public consumption
- **ui:** expose vite dev/preview on all interfaces
- wire root dev script and real Makefile targets
- **task-008:** Smart shelf P2a: MQTT broker, single ESP32 node, calibration, se
- task-008 status -> done
- **task-007:** Guest UI and menu publish (Vercel snapshot or local Caddy)
- task-007 status -> done
- **task-006:** AI mixology engine and recipe photo import
- task-006 status -> done
- task-006 status -> blocked
- auto-commit residual changes · task-006 run uwvdzccy
- **task-005:** Operator UI (React+Vite dense dark console) with ⌘K command pale
- task-005 status -> done
- task-005 status -> done
- **task-004:** Hono API, ingest core, and WebSocket /live
- task-004 status -> done
- **task-003:** Makeability engine and depletion math
- task-003 status -> done
- **task-003:** Makeability engine and depletion math
- **task-002:** SQLite schema, migrations, repositories, and canon seed
- task-002 status -> done
- **task-001:** Repo scaffold, workspace layout, and shared core types
- task-001 status -> done
- add specs for AI engine, data model, and guest UI
- merge ad-hoc session jj2x7dw2
- add API spec and update CLAUDE.md
- import operator spec to docs/internal/SPEC.md
- factory bootstrap

### Fixed

- **operator-ui:** eliminate x-axis overflow across all mobile views
- **operator-ui:** prevent x-axis overflow in default layout
- **guest-menu:** wire publish round-trip in dev — default to live mode
- **recipes:** garnishes and optionals don't block makeability in the UI
- **db:** migration 0006 — backfill canon-product categories
- **ui:** bottle level sparkline alignment + empty state
- **ui:** form inputs and textareas fill their row
- **ui:** bottle & product modal header overlap
- **ui:** crypto.randomUUID polyfill for insecure-context LAN dev

## [0.0.0] - 2026-06-12

### Added

- Initial pre-release Backbar workspace baseline.
