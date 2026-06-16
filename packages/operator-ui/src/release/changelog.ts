/**
 * Parse the bundled CHANGELOG.md into structured entries for the What's New
 * modal. Mirrors the factory release-notes format: a free-prose intro between
 * the version header and the first section, then `### Section` groups whose
 * bullets carry an optional bold lead-in (`**Lead.** body`).
 *
 * This is intentionally richer than a raw changelog echo — release notes are
 * authored (or model-drafted at release time) as human-friendly feature/fix
 * prose, and we render the lead bold + body muted.
 */
export interface ChangelogBullet {
  /** Bold lead-in (`**…**` prefix), without the trailing period — or null. */
  lead: string | null;
  /** Prose after the bold lead (or the whole bullet if there's no lead). */
  body: string;
}

export interface ChangelogSection {
  title: string;
  bullets: ChangelogBullet[];
}

export interface ChangelogEntry {
  version: string;
  date: string | null;
  /** Free-prose paragraph(s) between the version header and the first section. */
  intro: string;
  sections: ChangelogSection[];
}

const VERSION_HEADING_RE = /^##\s+\[?([^\]\n]+?)\]?(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?\s*$/;
const SECTION_HEADING_RE = /^###\s+(.+?)\s*$/;
const BULLET_RE = /^[-*]\s+(.+)$/;
const BOLD_LEAD_RE = /^\*\*([^*]+?)\*\*\s*(.*)$/;

function parseBullet(body: string): ChangelogBullet {
  const m = BOLD_LEAD_RE.exec(body);
  if (m && m[2] !== undefined) {
    const lead = m[1]!.trim().replace(/\.$/, "");
    return { lead, body: m[2].trim() };
  }
  return { lead: null, body: body.trim() };
}

function parseAllEntries(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  let section: ChangelogSection | null = null;
  let intro: string[] = [];

  const flushIntro = () => {
    if (current && intro.length) {
      current.intro = intro.join("\n").trim();
      intro = [];
    }
  };

  for (const line of markdown.split("\n")) {
    const version = VERSION_HEADING_RE.exec(line);
    if (version) {
      flushIntro();
      if (current) entries.push(current);
      current = { version: version[1]!.trim(), date: version[2] ?? null, intro: "", sections: [] };
      section = null;
      intro = [];
      continue;
    }
    if (!current) continue;

    const heading = SECTION_HEADING_RE.exec(line);
    if (heading) {
      flushIntro();
      section = { title: heading[1]!.trim(), bullets: [] };
      current.sections.push(section);
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    if (bullet && section) {
      section.bullets.push(parseBullet(bullet[1]!));
      continue;
    }

    // Indented continuation of the previous bullet.
    if (section?.bullets.length && /^\s+\S/.test(line)) {
      const last = section.bullets[section.bullets.length - 1]!;
      last.body = `${last.body} ${line.trim()}`.trim();
      continue;
    }

    // Otherwise it's intro prose (before the first section).
    if (!section && line.trim().length) intro.push(line);
  }

  flushIntro();
  if (current) entries.push(current);
  return entries;
}

/** The entry matching `version` exactly (never falls back to another version). */
export function latestChangelogEntry(markdown: string, version: string): ChangelogEntry | null {
  for (const entry of parseAllEntries(markdown)) {
    if (entry.version === "Unreleased" || entry.version !== version) continue;
    if (!entry.intro && !entry.sections.some((s) => s.bullets.length)) return null;
    return entry;
  }
  return null;
}
