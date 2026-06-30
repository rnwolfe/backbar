/**
 * Sweep flow — operator-ui integration test for the rapid inventory sweep
 * (spec api.md §2, task-021 acceptance #4). Drives the real <Sweep> component
 * through the three things the flow promises: pick a filter, tap a fractional
 * fill level, and advance to the next bottle — all without horizontal chrome.
 *
 * The server (`/sweep/bottles`, `/sweep/level`) is covered by
 * packages/server/test/sweep.test.ts; here we stub `api` so the test owns the
 * bottle list and asserts the component wires taps to the right calls and the
 * cursor advances on success.
 *
 * DOM is registered per-file (beforeAll/afterAll) so it never leaks into the
 * shared `bun test` process that also runs the DOM-less server/db/core suites.
 */
import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { fireEvent, render } from "@testing-library/react";
import React from "react";
import type { SweepFilter, SweepLevelKey, SweepRow } from "../src/api/client";

// ── controllable stub state, read by the mocked module's closures ───────────
const sweepBottlesCalls: SweepFilter[] = [];
const sweepLevelCalls: { bottle_id: string; level: SweepLevelKey }[] = [];
let bottlesResponse: { controls: unknown[]; count: number; bottles: SweepRow[] };
let levelResponse: Record<string, unknown>;

/** A minimal but shape-complete sweep row for a 750 ml rum bottle. */
function row(id: string, name: string, level_ml: number): SweepRow {
  const full_ml = 750;
  return {
    bottle: { id } as SweepRow["bottle"],
    product: { id: "rum", name } as SweepRow["product"],
    category: { id: "rum", label: "Rum", hue: 30 } as SweepRow["category"],
    display: {
      name,
      category: "rum",
      category_label: "Rum",
      category_hue: 30,
      slot: null,
      status: "open",
      tracked: false,
      level_ml,
      full_ml,
      fill_pct: Math.round((level_ml / full_ml) * 100),
      low: false,
    },
  };
}

// The component pulls the live bottle list + per-tap save through `api`; the
// store only feeds the category chips. Both are resolved to the same absolute
// modules <Sweep> imports, so these mocks replace them transparently.
mock.module("../src/api/client", () => ({
  api: {
    sweepBottles: async (filter: SweepFilter = {}) => {
      sweepBottlesCalls.push(filter);
      return bottlesResponse;
    },
    sweepLevel: async (body: { bottle_id: string; level: SweepLevelKey }) => {
      sweepLevelCalls.push(body);
      return levelResponse;
    },
  },
}));

mock.module("../src/store/useStore", () => ({
  useStore: <T,>(selector: (s: { categories: unknown[] }) => T): T =>
    selector({
      categories: [{ id: "rum", label: "Rum", hue: 30, sort_order: 0, created_at: 0 }],
    }),
}));

// Imported after the mocks above are registered (mock.module is not hoisted).
const { Sweep } = await import("../src/views/Sweep");

describe("<Sweep> — filter → fractional tap → advance", () => {
  beforeAll(() => GlobalRegistrator.register());
  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });
  afterEach(() => {
    sweepBottlesCalls.length = 0;
    sweepLevelCalls.length = 0;
  });

  test("selects a filter, taps 75%, and advances to the next bottle", async () => {
    bottlesResponse = {
      controls: [],
      count: 2,
      bottles: [row("b1", "Generic Rum", 700), row("b2", "Aged Rum", 700)],
    };
    levelResponse = { ok: true, reading_id: "r1", level_ml: 563, status: "open", flipped_empty: false };

    const { getByText, findByText, queryByText } = render(
      <Sweep onClose={() => {}} onToast={() => {}} accent="#4ddae8" />,
    );

    // 1. FILTER — pick the "Rum" category chip, then start the sweep.
    fireEvent.click(getByText("Rum"));
    fireEvent.click(getByText("START SWEEP"));

    // 2. The chosen filter reached the server, and the first bottle is shown.
    await findByText("Generic Rum");
    expect(sweepBottlesCalls).toHaveLength(1);
    expect(sweepBottlesCalls[0]).toMatchObject({ category: "rum" });
    expect(queryByText("Aged Rum")).toBeNull();

    // 3. SWEEP — tap a fractional fill level (75%).
    fireEvent.click(getByText("75%"));

    // 4. The tap saved the right level and the flow advanced to the next bottle.
    await findByText("Aged Rum");
    expect(sweepLevelCalls).toHaveLength(1);
    expect(sweepLevelCalls[0]).toEqual({ bottle_id: "b1", level: "75" });
    expect(queryByText("Generic Rum")).toBeNull();
  });

  test("EMPTY / GONE records an empty save and advances", async () => {
    bottlesResponse = {
      controls: [],
      count: 2,
      bottles: [row("b1", "Generic Rum", 40), row("b2", "Aged Rum", 700)],
    };
    levelResponse = {
      ok: true,
      reading_id: "r2",
      level_ml: 0,
      status: "empty",
      flipped_empty: true,
      shopping_signal: { product: { id: "rum", name: "Generic Rum" }, depleted_bottle_ids: ["b1"], remaining_in_stock: 0, out: true },
    };

    const { getByText, findByText } = render(
      <Sweep onClose={() => {}} onToast={() => {}} accent="#4ddae8" />,
    );

    fireEvent.click(getByText("START SWEEP"));
    await findByText("Generic Rum");

    fireEvent.click(getByText("EMPTY / GONE"));

    await findByText("Aged Rum");
    expect(sweepLevelCalls).toHaveLength(1);
    expect(sweepLevelCalls[0]).toEqual({ bottle_id: "b1", level: "empty" });
  });
});
