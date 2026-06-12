import { describe, expect, test } from "bun:test";
import {
  bumpVersion,
  determineBump,
  insertChangelogEntry,
  parseConventionalCommit,
  renderChangelogEntry,
} from "./release";

describe("release workflow helpers", () => {
  test("maps conventional commits to pre-1.0 bumps", () => {
    const commits = [
      parseConventionalCommit({ hash: "1", subject: "fix(operator-ui): close modal once", body: "" }),
    ].filter((commit) => commit !== null);
    expect(determineBump(commits, "0.2.0")).toBe("patch");
    expect(bumpVersion("0.2.0", "patch")).toBe("0.2.1");

    const breaking = [
      parseConventionalCommit({ hash: "2", subject: "feat!: replace release flow", body: "" }),
    ].filter((commit) => commit !== null);
    expect(determineBump(breaking, "0.2.1")).toBe("minor");
    expect(bumpVersion("0.2.1", "minor")).toBe("0.3.0");
  });

  test("renders and inserts a Keep-a-Changelog release section", () => {
    const commits = [
      parseConventionalCommit({ hash: "1", subject: "feat(ui): add what's new modal", body: "" }),
      parseConventionalCommit({ hash: "2", subject: "fix(release): keep tags annotated", body: "" }),
      parseConventionalCommit({ hash: "3", subject: "docs: document recovery", body: "" }),
    ].filter((commit) => commit !== null);

    const entry = renderChangelogEntry("0.1.0", "2026-06-12", commits);
    const changelog = insertChangelogEntry("# Changelog\n\n## [Unreleased]\n\n## [0.0.0] - 2026-06-12\n", entry, "0.1.0");

    expect(changelog).toContain("## [0.1.0] - 2026-06-12");
    expect(changelog).toContain("### Added\n\n- **ui:** add what's new modal");
    expect(changelog).toContain("### Fixed\n\n- **release:** keep tags annotated");
    expect(changelog.indexOf("## [0.1.0]")).toBeLessThan(changelog.indexOf("## [0.0.0]"));
  });
});
