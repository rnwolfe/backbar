/**
 * 2-point load-cell calibration — spec §4.
 *
 *   grams = raw * slope + offset
 *
 * Operator captures two raw readings:
 *   1. `empty_raw`  — channel with nothing on it (mass = 0 g)
 *   2. `known_raw`  — channel with a known reference mass `known_g`
 *
 * Solving the linear system:
 *   slope  = known_g / (known_raw - empty_raw)
 *   offset = -slope * empty_raw      (so grams(empty_raw) = 0)
 *
 * Tare is recorded separately per bottle (`bottle.tare_g`) because two
 * Beefeater bottles can share a calibrated channel but have different
 * empty-bottle weights. The ingest core does:
 *
 *   gross_g = raw_g * slope + offset           // channel-level cal
 *   net_g   = gross_g - bottle.tare_g          // bottle-level tare
 *   level_ml = net_g / density                 // product-level density
 */
export interface CalibrationInput {
  empty_raw: number;
  known_raw: number;
  known_g: number;
}

export interface Calibration {
  slope: number;
  offset: number;
}

/** Compute slope+offset from a 2-point sample. Throws if the points coincide. */
export function calibrate(input: CalibrationInput): Calibration {
  if (input.known_g <= 0) {
    throw new Error(`known_g must be positive, got ${input.known_g}`);
  }
  const dr = input.known_raw - input.empty_raw;
  if (dr === 0) {
    throw new Error("empty_raw and known_raw are equal — cannot solve calibration");
  }
  const slope = input.known_g / dr;
  const offset = -slope * input.empty_raw;
  return { slope, offset };
}

/** Apply a calibration to a raw channel reading → grams. */
export function rawToGrams(raw: number, cal: Calibration): number {
  return raw * cal.slope + cal.offset;
}
