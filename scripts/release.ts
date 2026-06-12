import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Bump = "major" | "minor" | "patch" | "none";

export interface GitCommit {
  hash: string;
  subject: string;
  body: string;
}

export interface ConventionalCommit extends GitCommit {
  type: string;
  scope: string | null;
  description: string;
  breaking: boolean;
}

const ROOT = join(import.meta.dir, "..");
const PACKAGE_JSON = join(ROOT, "package.json");
const CHANGELOG = join(ROOT, "CHANGELOG.md");
const COMMIT_RE = /^([a-z]+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/;

const SECTION_BY_TYPE: Record<string, string> = {
  feat: "Added",
  fix: "Fixed",
  perf: "Changed",
  refactor: "Changed",
  docs: "Changed",
  test: "Changed",
  chore: "Changed",
  build: "Changed",
  ci: "Changed",
  style: "Changed",
  revert: "Removed",
};

const SECTION_ORDER = ["Added", "Changed", "Fixed", "Removed"] as const;

function git(args: string[], options: { allowFailure?: boolean } = {}): string {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    if (options.allowFailure) return "";
    throw error;
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`unsupported semver version: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function bumpVersion(version: string, bump: Exclude<Bump, "none">): string {
  const [major, minor, patch] = parseVersion(version);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function parseConventionalCommit(commit: GitCommit): ConventionalCommit | null {
  const match = COMMIT_RE.exec(commit.subject);
  if (!match) return null;
  const type = match[1]!;
  const scope = match[2];
  const bang = match[3];
  const description = match[4]!;
  const breaking = Boolean(bang) || /\bBREAKING CHANGE:\s+/m.test(commit.body);
  return {
    ...commit,
    type,
    scope: scope ?? null,
    description,
    breaking,
  };
}

export function determineBump(commits: ConventionalCommit[], currentVersion: string): Bump {
  const [major] = parseVersion(currentVersion);
  if (commits.some((commit) => commit.breaking)) return major === 0 ? "minor" : "major";
  if (commits.some((commit) => commit.type === "feat")) return "minor";
  if (commits.some((commit) => commit.type === "fix")) return "patch";
  return "none";
}

export function renderChangelogEntry(version: string, date: string, commits: ConventionalCommit[]): string {
  const groups = new Map<string, string[]>();
  for (const commit of commits) {
    const section = SECTION_BY_TYPE[commit.type];
    if (!section) continue;
    const scope = commit.scope ? `**${commit.scope}:** ` : "";
    const breaking = commit.breaking ? "**BREAKING:** " : "";
    const line = `- ${breaking}${scope}${commit.description}`;
    groups.set(section, [...(groups.get(section) ?? []), line]);
  }

  let entry = `## [${version}] - ${date}\n`;
  for (const section of SECTION_ORDER) {
    const lines = groups.get(section);
    if (!lines?.length) continue;
    entry += `\n### ${section}\n\n${lines.join("\n")}\n`;
  }
  return `${entry.trimEnd()}\n`;
}

export function insertChangelogEntry(changelog: string, entry: string, version: string): string {
  const normalized = changelog.trimEnd();
  const withoutExisting = normalized.replace(
    new RegExp(`\\n## \\[${version.replaceAll(".", "\\.")}\\][\\s\\S]*?(?=\\n## \\[|$)`),
    "",
  );
  const unreleased = "## [Unreleased]";
  const headingIndex = withoutExisting.indexOf(unreleased);
  if (headingIndex === -1) {
    return `${withoutExisting}\n\n${unreleased}\n\n${entry}\n`;
  }
  const insertAt = withoutExisting.indexOf("\n## [", headingIndex + unreleased.length);
  if (insertAt === -1) {
    return `${withoutExisting}\n\n${entry}\n`;
  }
  return `${withoutExisting.slice(0, insertAt).trimEnd()}\n\n${entry}\n${withoutExisting.slice(insertAt + 1).trimStart()}\n`;
}

function readRootVersion(): string {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as { version?: unknown };
  if (typeof pkg.version !== "string") throw new Error("root package.json must declare a string version");
  return pkg.version;
}

function writeRootVersion(version: string): void {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as Record<string, unknown>;
  pkg.version = version;
  writeFileSync(PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`);
}

function latestVersionTag(): string | null {
  const tag = git(["describe", "--tags", "--match", "v[0-9]*.[0-9]*.[0-9]*", "--abbrev=0"], {
    allowFailure: true,
  });
  return tag || null;
}

function commitsSince(tag: string | null): GitCommit[] {
  const args = ["log", "--format=%H%x1f%s%x1f%b%x1e"];
  if (tag) args.push(`${tag}..HEAD`);
  const out = git(args);
  return out
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash = "", subject = "", body = ""] = record.split("\x1f");
      return { hash, subject, body };
    });
}

function assertCleanWorktree(): void {
  const status = git(["status", "--porcelain"]);
  if (status) throw new Error("release requires a clean worktree");
}

function assertTagDoesNotExist(tag: string): void {
  const existing = git(["tag", "--list", tag]);
  if (existing) throw new Error(`tag already exists: ${tag}`);
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun) assertCleanWorktree();

  const currentVersion = readRootVersion();
  const lastTag = latestVersionTag();
  const conventionalCommits = commitsSince(lastTag)
    .map(parseConventionalCommit)
    .filter((commit): commit is ConventionalCommit => commit !== null);
  const bump = determineBump(conventionalCommits, currentVersion);

  if (bump === "none") {
    console.log("No feat:, fix:, or breaking conventional commits found; no release needed.");
    return;
  }

  const nextVersion = bumpVersion(currentVersion, bump);
  const tag = `v${nextVersion}`;
  assertTagDoesNotExist(tag);

  const entry = renderChangelogEntry(nextVersion, today(), conventionalCommits);

  if (dryRun) {
    console.log(`last tag: ${lastTag ?? "(none)"}`);
    console.log(`current version: ${currentVersion}`);
    console.log(`next version: ${nextVersion} (${bump})`);
    console.log(`tag: ${tag}`);
    console.log("");
    console.log(entry.trimEnd());
    return;
  }

  const changelog = existsSync(CHANGELOG) ? readFileSync(CHANGELOG, "utf8") : "# Changelog\n\n## [Unreleased]\n";
  writeRootVersion(nextVersion);
  writeFileSync(CHANGELOG, insertChangelogEntry(changelog, entry, nextVersion));

  git(["add", "package.json", "CHANGELOG.md"]);
  git(["commit", "-m", `chore(release): ${tag}`]);
  git(["tag", "-a", tag, "-m", tag]);

  console.log(`Created ${tag}. Review, then run:`);
  console.log(`git push origin HEAD`);
  console.log(`git push origin ${tag}`);
}

if (import.meta.main) {
  main();
}
