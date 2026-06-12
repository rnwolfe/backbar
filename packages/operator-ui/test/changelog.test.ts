import { describe, expect, test } from "bun:test";
import { latestChangelogEntry } from "../src/release/changelog";

describe("latestChangelogEntry", () => {
  test("reads the section matching the running version", () => {
    const entry = latestChangelogEntry(
      `# Changelog

## [Unreleased]

## [0.2.0] - 2026-06-12

### Added

- **operator-ui:** add what's new modal

### Fixed

- prevent duplicate display

## [0.1.0] - 2026-06-01

### Added

- previous release
`,
      "0.2.0",
    );

    expect(entry?.version).toBe("0.2.0");
    expect(entry?.sections).toEqual([
      { title: "Added", items: ["operator-ui: add what's new modal"] },
      { title: "Fixed", items: ["prevent duplicate display"] },
    ]);
  });

  test("does not fall back to a different version", () => {
    expect(latestChangelogEntry("## [0.1.0]\n\n### Added\n\n- baseline\n", "0.2.0")).toBeNull();
  });
});
