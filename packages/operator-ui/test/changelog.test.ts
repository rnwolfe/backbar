import { describe, expect, test } from "bun:test";
import { latestChangelogEntry } from "../src/release/changelog";

describe("latestChangelogEntry", () => {
  test("reads intro + lead/body bullets for the running version", () => {
    const entry = latestChangelogEntry(
      `# Changelog

## [Unreleased]

## [0.2.0] - 2026-06-12

This release sharpens the operator console.

### Added

- **What's new modal.** First visit after an upgrade shows the release notes.

### Fixed

- Prevented a duplicate display on reconnect.

## [0.1.0] - 2026-06-01

### Added

- previous release
`,
      "0.2.0",
    );

    expect(entry?.version).toBe("0.2.0");
    expect(entry?.intro).toBe("This release sharpens the operator console.");
    expect(entry?.sections).toEqual([
      {
        title: "Added",
        bullets: [
          { lead: "What's new modal", body: "First visit after an upgrade shows the release notes." },
        ],
      },
      {
        title: "Fixed",
        bullets: [{ lead: null, body: "Prevented a duplicate display on reconnect." }],
      },
    ]);
  });

  test("does not fall back to a different version", () => {
    expect(latestChangelogEntry("## [0.1.0]\n\n### Added\n\n- baseline\n", "0.2.0")).toBeNull();
  });
});
