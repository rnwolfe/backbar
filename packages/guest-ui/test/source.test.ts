import { describe, expect, it } from "bun:test";
import { normalizePayload } from "../src/source";

describe("normalizePayload", () => {
  it("treats a bare array as a snapshot in snapshot mode", () => {
    const out = normalizePayload([{ name: "X", family: null, glass: null, ice: null, garnish: null, instructions: null, tags: [] }], "snapshot");
    expect(out.mode).toBe("snapshot");
    expect(out.items).toHaveLength(1);
  });

  it("annotates a bare array with available=true in live mode", () => {
    const out = normalizePayload([{ name: "X", family: null, glass: null, ice: null, garnish: null, instructions: null, tags: [] }], "live");
    expect(out.mode).toBe("live");
    if (out.mode === "live") {
      expect(out.items[0]!.available).toBe(true);
    }
  });

  it("rejects malformed payloads", () => {
    expect(() => normalizePayload({} as unknown, "snapshot")).toThrow();
    expect(() => normalizePayload("not a menu" as unknown, "snapshot")).toThrow();
  });
});
