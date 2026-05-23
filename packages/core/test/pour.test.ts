import { describe, expect, test } from "bun:test";
import {
  depletePour,
  EMPTY_THRESHOLD_ML,
  statusAfterDepletion,
  type BottleDepletion,
} from "../src/pour";

const levels = (entries: [string, number][]) => new Map(entries);

describe("depletePour()", () => {
  test("subtracts the recorded binding ml exactly", () => {
    const d = depletePour(
      [{ bottle_id: "b1", ml: 30 }, { bottle_id: "b2", ml: 22.5 }],
      levels([["b1", 700], ["b2", 500]]),
    );
    expect(d).toEqual([
      { bottle_id: "b1", prev_ml: 700, new_ml: 670, ml: 30, flip_empty: false },
      { bottle_id: "b2", prev_ml: 500, new_ml: 477.5, ml: 22.5, flip_empty: false },
    ]);
  });

  test("ml=0 (non-depleting unit) returns prev untouched and does not flip empty", () => {
    const d = depletePour(
      [{ bottle_id: "b1", ml: 0 }],
      levels([["b1", 1]]), // already near zero
    );
    expect(d[0]?.new_ml).toBe(1);
    expect(d[0]?.flip_empty).toBe(false);
  });

  test("residual at/under the empty threshold flips empty", () => {
    const d = depletePour(
      [{ bottle_id: "b1", ml: 700 }],
      levels([["b1", 700 + EMPTY_THRESHOLD_ML]]),
    );
    expect(d[0]?.new_ml).toBe(EMPTY_THRESHOLD_ML);
    expect(d[0]?.flip_empty).toBe(true);
  });

  test("residual just above threshold does NOT flip empty", () => {
    const d = depletePour(
      [{ bottle_id: "b1", ml: 700 }],
      levels([["b1", 700 + EMPTY_THRESHOLD_ML + 0.1]]),
    );
    expect(d[0]?.flip_empty).toBe(false);
  });

  test("over-draw throws", () => {
    expect(() =>
      depletePour([{ bottle_id: "b1", ml: 100 }], levels([["b1", 50]])),
    ).toThrow(/over-draw/);
  });

  test("unknown bottle throws", () => {
    expect(() =>
      depletePour([{ bottle_id: "ghost", ml: 10 }], levels([["b1", 50]])),
    ).toThrow(/unknown bottle/);
  });
});

describe("statusAfterDepletion()", () => {
  const dep = (flip_empty: boolean): BottleDepletion => ({
    bottle_id: "b1",
    prev_ml: 100,
    new_ml: 0,
    ml: 100,
    flip_empty,
  });

  test("flip_empty -> empty regardless of previous status", () => {
    expect(statusAfterDepletion("open", dep(true))).toBe("empty");
    expect(statusAfterDepletion("sealed", dep(true))).toBe("empty");
  });

  test("no flip preserves status", () => {
    expect(statusAfterDepletion("open", dep(false))).toBe("open");
    expect(statusAfterDepletion("sealed", dep(false))).toBe("sealed");
  });
});
