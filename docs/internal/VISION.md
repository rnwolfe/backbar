# backbar — Vision

> Authored by Factory plan `#scbp8xba`. Edits welcome — this
> is a checked-in document like any other.

## Identity

Backbar is a local-first operating system for a serious home bar: inventory, bottles, pours, recipes, guest menu, and grounded AI mixology from one SQLite source of truth. It is production-minded but self-hosted by design: it should run end-to-end with zero hardware, and the smart shelf remains an optional sensing layer.

## Audience

Home bar operators who want a reliable behind-the-bar console and a polished guest menu without giving their inventory or habits to a cloud service.

## Problem

It removes the gap between what is on the shelf, what can actually be poured, and what guests can see right now, while keeping depletion, sharing, and AI suggestions honest.

## Design principles

- **Local first over convenient cloud.** The core product runs on the operator's own hardware with SQLite on disk; outbound calls are explicit integrations, not the foundation.
- **Inventory truth over UI convenience.** Readings are append-only events and bottle level is a rebuildable cache, even when mutating a number would be easier.
- **Zero hardware baseline.** Manual entry and pour subtraction must stay first-class; weight sensors are an adapter, not a prerequisite.
- **Grounded AI over clever AI.** Models may ideate, import, and enrich, but every output is schema-checked and validated against the live shelf before it reaches the product.
- **Two surfaces, two moods.** The operator console can be dense, dark, and keyboard-heavy; the guest menu should feel calm, editorial, mobile-first, and safe to share.
- **Sanitized public views over shared internals.** Any public URL must expose only guest-safe read data, never operator controls or exact private inventory details.

## Out of scope

- No hosted SaaS account, subscription, or mandatory cloud sync.
- No multi-bar or multi-tenant product unless the single-home-bar premise stops being true.
- No requirement that users build the smart shelf before the app is useful.
- No public exposure of exact bottle levels, costs, private notes, or operator routes.
- No silent AI ingredient substitutions to make a generated drink appear possible.
- No bundled scraped cocktail-book prose; owned-book content enters through user-initiated import.
- No procurement system that can make the core bar unstable; brittle vendor lookups stay isolated and optional.

## Personality

Operator UI: dispatch-console dark, dense, fast, amber-accented, built for repeated use behind a bar. Guest UI: warm paper, editorial type, readable on a phone, closer to a printed menu than an app dashboard.

## Roadmap

### now

- Keep daily-use inventory, pours, recipes, AI ideation, photo import, guest menu, and share URLs stable.
- Finish mobile overflow and operator-console ergonomics so the tablet and phone views feel deliberate.
- Harden bulk shelf-photo import with candidate review, grounded enrichment, and safe confirmation into canonical inventory paths.

### near

- Make the smart-shelf path credible behind the feature flag: calibration, MQTT ingest, settle detection, and replayable readings.
- Tighten guest publishing between live Caddy mode and static snapshot mode, including share-link confidence.
- Document the specs that agents actually need before expanding more surface area.

### later

- Add optional procurement lookup through the ProcurementSource interface without letting vendor brittleness leak upward.
- Decide whether and how the private project becomes reusable by others; do not let that decision pull the product toward SaaS by default.

## Prior art

- Printed cocktail menus — the guest surface borrows their editorial calm and read-only confidence instead of acting like a dashboard.
- Home Assistant-style local control — Backbar should be useful on a LAN with optional integrations, not dependent on a vendor account.
- Cocktail recipe books — they shape recipe structure and balance thinking, while copyright keeps prose and owned-book imports out of the seed data.
- POS/backbar consoles — the operator surface borrows density, speed, and repeat-use affordances rather than consumer-app spaciousness.
- Event-sourced inventory systems — append-only readings make level history auditable and rebuildable instead of trusting the latest mutable value.
