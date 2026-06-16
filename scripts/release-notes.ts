/**
 * Human-friendly release notes — the "What's New" prose.
 *
 * The deterministic changelog in release.ts groups conventional-commit
 * *subjects* by type. That's accurate but reads like a git log. This module
 * mirrors factory's approach: at release time, a model rewrites the change set
 * into curated feature/fix prose — a one-line intro plus bullets shaped as
 * `**Lead.** body` — which the operator console's What's New modal renders.
 *
 * It degrades gracefully: no AI key, offline, or any error → returns null and
 * release.ts falls back to the deterministic changelog. Pure (no IO) helpers
 * stay testable; only `draftReleaseNotes` reaches the network.
 */
import { createGateway } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { ConventionalCommit } from "./release";

const SECTION_ORDER = ["Added", "Changed", "Fixed", "Removed"] as const;

const NotesSchema = z.object({
  intro: z
    .string()
    .describe("One short sentence (max ~20 words) summarizing the release's theme. No version number."),
  sections: z
    .array(
      z.object({
        heading: z.enum(SECTION_ORDER),
        bullets: z
          .array(
            z.object({
              lead: z
                .string()
                .describe("A short bold summary (3-8 words), no trailing period, user-facing."),
              body: z
                .string()
                .describe("One sentence explaining the change in plain, user-facing terms."),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export type DraftedNotes = z.infer<typeof NotesSchema>;

const MODEL = process.env.RELEASE_NOTES_MODEL ?? "anthropic/claude-sonnet-4";

function gatewayKey(): string | null {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  const path = join(homedir(), ".ai_gateway_api_key");
  if (existsSync(path)) {
    try {
      const key = readFileSync(path, "utf8").trim();
      if (key) return key;
    } catch {
      // fall through
    }
  }
  return null;
}

/** Render drafted notes into a Keep-a-Changelog section (`## [version] - date`). */
export function renderDraftedEntry(version: string, date: string, notes: DraftedNotes): string {
  const ordered = [...notes.sections].sort(
    (a, b) => SECTION_ORDER.indexOf(a.heading) - SECTION_ORDER.indexOf(b.heading),
  );
  let entry = `## [${version}] - ${date}\n`;
  if (notes.intro.trim()) entry += `\n${notes.intro.trim()}\n`;
  for (const section of ordered) {
    if (!section.bullets.length) continue;
    entry += `\n### ${section.heading}\n\n`;
    entry += section.bullets
      .map((b) => {
        const lead = b.lead.trim().replace(/\.$/, "");
        const body = b.body.trim();
        return lead ? `- **${lead}.** ${body}` : `- ${body}`;
      })
      .join("\n");
    entry += "\n";
  }
  return `${entry.trimEnd()}\n`;
}

function commitDigest(commits: ConventionalCommit[]): string {
  return commits
    .map((c) => {
      const scope = c.scope ? `(${c.scope})` : "";
      const breaking = c.breaking ? " [BREAKING]" : "";
      const body = c.body.trim() ? `\n    ${c.body.trim().replace(/\n+/g, " ").slice(0, 300)}` : "";
      return `- ${c.type}${scope}${breaking}: ${c.description}${body}`;
    })
    .join("\n");
}

/**
 * Draft human-friendly notes from the release's conventional commits. Returns
 * null on any failure so callers fall back to the deterministic changelog.
 */
export async function draftReleaseNotes(
  commits: ConventionalCommit[],
  version: string,
): Promise<DraftedNotes | null> {
  if (!commits.length) return null;
  const apiKey = gatewayKey();
  if (!apiKey) return null;

  const prompt = [
    `You are writing the "What's New" release notes for Backbar — a local-first home-bar OS`,
    `(inventory, weight-based depletion, recipes, AI mixology). Version ${version}.`,
    ``,
    `Rewrite these conventional commits into concise, user-facing release notes.`,
    `Rules:`,
    `- Write for an operator using the app, not a developer reading git. No scopes, hashes, or jargon.`,
    `- Group into "Added" (new features), "Fixed" (bug fixes), "Changed" (improvements). Omit empty groups.`,
    `- Collapse noise: pure release/chore/task-tracking/internal-refactor commits should be merged into a`,
    `  bullet or dropped — never list them verbatim.`,
    `- Each bullet: a short bold lead (the headline) + one sentence of plain explanation.`,
    `- Be selective. Aim for the 3-6 changes that matter most; don't enumerate everything.`,
    `- intro: one short sentence capturing the release's theme.`,
    ``,
    `Commits:`,
    commitDigest(commits),
  ].join("\n");

  try {
    const gateway = createGateway({ apiKey });
    const { object } = await generateObject({
      model: gateway(MODEL),
      schema: NotesSchema,
      prompt,
    });
    // Keep only known sections with at least one bullet.
    const sections = object.sections.filter((s) => s.bullets.length);
    if (!sections.length) return null;
    return { intro: object.intro, sections };
  } catch (error) {
    console.error(`[release-notes] drafting failed, falling back to changelog: ${(error as Error).message}`);
    return null;
  }
}
