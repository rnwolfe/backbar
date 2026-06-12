export interface ChangelogSection {
  title: string;
  items: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string | null;
  sections: ChangelogSection[];
}

const VERSION_HEADING_RE = /^## \[?([^\]\n]+)\]?(?: - ([0-9]{4}-[0-9]{2}-[0-9]{2}))?$/gm;
const SECTION_HEADING_RE = /^### (.+)$/gm;

export function latestChangelogEntry(markdown: string, version: string): ChangelogEntry | null {
  const headings = [...markdown.matchAll(VERSION_HEADING_RE)];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]!;
    const headingVersion = heading[1]?.trim();
    if (!headingVersion || headingVersion === "Unreleased" || headingVersion !== version) continue;

    const start = (heading.index ?? 0) + heading[0].length;
    const nextHeading = headings[index + 1];
    const end = nextHeading?.index ?? markdown.length;
    const body = markdown.slice(start, end);
    const sections = parseSections(body);
    if (!sections.length) return null;

    return {
      version: headingVersion,
      date: heading[2] ?? null,
      sections,
    };
  }
  return null;
}

function parseSections(body: string): ChangelogSection[] {
  const headings = [...body.matchAll(SECTION_HEADING_RE)];
  return headings
    .map((heading, index) => {
      const title = heading[1]?.trim() ?? "";
      const start = (heading.index ?? 0) + heading[0].length;
      const nextHeading = headings[index + 1];
      const end = nextHeading?.index ?? body.length;
      const items = body
        .slice(start, end)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("- "))
        .map((line) => line.slice(2).replace(/\*\*/g, ""));
      return { title, items };
    })
    .filter((section) => section.title && section.items.length);
}
