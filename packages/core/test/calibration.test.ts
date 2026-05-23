import { describe, expect, test } from "bun:test";
import { calibrate, rawToGrams } from "../src/calibration";

describe("calibration — 2-point per-channel", () => {
  test("recovers a clean linear cal from synthetic points", () => {
    // True relationship: grams = 0.001 * raw - 100  (e.g. HX711 counts)
    const empty_raw = 100_000;
    const known_raw = 600_000;
    const known_g = 500;

    const cal = calibrate({ empty_raw, known_raw, known_g });
    expect(rawToGrams(empty_raw, cal)).toBeCloseTo(0, 4);
    expect(rawToGrams(known_raw, cal)).toBeCloseTo(500, 4);
    // A midpoint raw → linearly between 0 and 500 g.
    expect(rawToGrams(350_000, cal)).toBeCloseTo(250, 4);
  });

  test("supports a negative empty offset (raw < 0 at empty)", () => {
    const cal = calibrate({ empty_raw: -50_000, known_raw: 50_000, known_g: 1000 });
    expect(rawToGrams(-50_000, cal)).toBeCloseTo(0, 4);
    expect(rawToGrams(0, cal)).toBeCloseTo(500, 4);
    expect(rawToGrams(50_000, cal)).toBeCloseTo(1000, 4);
  });

  test("rejects coincident points", () => {
    expect(() => calibrate({ empty_raw: 100, known_raw: 100, known_g: 500 })).toThrow(/empty_raw and known_raw/);
  });

  test("rejects non-positive known mass", () => {
    expect(() => calibrate({ empty_raw: 0, known_raw: 1000, known_g: 0 })).toThrow(/known_g/);
    expect(() => calibrate({ empty_raw: 0, known_raw: 1000, known_g: -100 })).toThrow(/known_g/);
  });
});
