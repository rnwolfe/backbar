/**
 * Vision model evaluation for bar-inventory photo import.
 *
 * Tests candidate models on:
 *   1. Bottle detection accuracy (count)
 *   2. Specific-version identification (brand + expression vs category only)
 *   3. Fill-level reading (does the model provide fill estimates?)
 *   4. Per-image latency and token usage
 *   5. Web-grounded detail lookup capability (qualitative, assessed in notes)
 *
 * Batching note: a single multi-bottle photo is ONE model call that covers
 * many products; this is structurally more efficient than N individual calls.
 *
 * Images: public-domain / CC-BY-SA from Wikipedia and Wikimedia Commons.
 * All fetched via their respective REST APIs with a proper User-Agent.
 *
 * Run: bun run packages/server/src/ai/eval/bench-vision.ts [--models a,b,c] [--out results.json]
 */

import { createGateway } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema — structured output the model must return for each bar photo
// ---------------------------------------------------------------------------

const BottleDetection = z.object({
  product_name: z
    .string()
    .describe(
      "Full brand and expression, e.g. 'Maker's Mark Bourbon Whisky'",
    ),
  brand: z
    .string()
    .nullable()
    .describe("Brand name only, e.g. 'Maker's Mark'"),
  category: z
    .string()
    .nullable()
    .describe("Spirit category: whisky, gin, rum, vodka, tequila, etc."),
  subcategory: z
    .string()
    .nullable()
    .describe("Sub-category: bourbon, scotch, london-dry, blanco, etc."),
  fill_level_pct: z
    .number()
    .min(0)
    .max(100)
    .nullable()
    .describe("Estimated fill percentage 0-100; null if unclear from image"),
  fill_label: z
    .enum(["full", "three-quarter", "half", "quarter", "empty"])
    .nullable()
    .describe("Coarse fill bucket; null if level not visible"),
  abv_pct: z
    .number()
    .min(0)
    .max(100)
    .nullable()
    .describe("ABV percentage if legible on label; null otherwise"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Detection confidence 0-1"),
});

const InventoryImport = z.object({
  bottles: z.array(BottleDetection).describe("All bottles visible in the image"),
  bottle_count: z
    .number()
    .int()
    .min(0)
    .describe("Total distinct bottles detected"),
  scene_notes: z
    .string()
    .nullable()
    .describe("Image quality issues or visibility notes"),
});
type InventoryImport = z.infer<typeof InventoryImport>;

// ---------------------------------------------------------------------------
// Test images — public-domain or CC from Wikipedia / Wikimedia Commons
// ---------------------------------------------------------------------------

interface TestCase {
  id: string;
  description: string;
  source: "wikipedia" | "commons";
  wikiTitle?: string;
  commonsFile?: string;
  /** Max dimension (px) for thumbnail. Use to keep images under ~300KB. */
  thumbnailWidth?: number;
  expected: {
    bottleCount: number;
    /** Lowercase tokens that MUST appear in detected product_name or brand. */
    mustContainBrands?: string[];
    fillLevelExpected: boolean;
  };
}

const TEST_CASES: TestCase[] = [
  {
    id: "makers-mark-single",
    description: "Maker's Mark bourbon — single bottle product shot (Wikipedia)",
    source: "wikipedia",
    wikiTitle: "Maker%27s_Mark",
    thumbnailWidth: 400,
    expected: {
      bottleCount: 1,
      mustContainBrands: ["maker"],
      fillLevelExpected: false,
    },
  },
  {
    id: "hendricks-single",
    description: "Hendrick's Gin — single bottle product shot (Wikipedia)",
    source: "wikipedia",
    wikiTitle: "Hendrick%27s_Gin",
    thumbnailWidth: 400,
    expected: {
      bottleCount: 1,
      mustContainBrands: ["hendrick"],
      fillLevelExpected: false,
    },
  },
  {
    id: "cointreau-single",
    description: "Cointreau — single bottle product shot (Wikipedia)",
    source: "wikipedia",
    wikiTitle: "Cointreau",
    thumbnailWidth: 400,
    expected: {
      bottleCount: 1,
      mustContainBrands: ["cointreau"],
      fillLevelExpected: false,
    },
  },
  {
    id: "bar-shelf-multi",
    description:
      "Bar shelf multi-bottle — mixed spirits on a bar wall (Wikimedia Commons, CC-BY-SA)",
    source: "commons",
    commonsFile: "File:Liquor and wine bottles behind a bar in Baden, Austria.jpg",
    thumbnailWidth: 800,
    expected: {
      bottleCount: 6,
      fillLevelExpected: true,
    },
  },
];

// ---------------------------------------------------------------------------
// Image fetching helpers
// ---------------------------------------------------------------------------

const UA = "backbar-eval/1.0 (backbar-os; rn.wolfe@gmail.com)";

interface FetchedImage {
  url: string;
  b64: string;
  mediaType: string;
  sizeKb: number;
}

async function fetchWikipediaThumbnail(
  title: string,
  width: number,
): Promise<FetchedImage | null> {
  try {
    const summaryResp = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`,
      { headers: { "User-Agent": UA } },
    );
    if (!summaryResp.ok) return null;
    const summary = (await summaryResp.json()) as {
      thumbnail?: { source?: string };
    };

    const originalUrl = summary.thumbnail?.source;
    if (!originalUrl) return null;

    // Try a width-rewritten thumbnail first; if that 400s (source smaller than
    // requested width), fall back to the original thumbnail URL.
    const candidates: string[] = [];
    if (originalUrl.includes("/thumb/")) {
      const rewritten = originalUrl.replace(/\/\d+px-/, `/${width}px-`);
      if (rewritten !== originalUrl) candidates.push(rewritten);
    }
    candidates.push(originalUrl);

    for (const url of candidates) {
      const imgResp = await fetch(url, { headers: { "User-Agent": UA } });
      if (!imgResp.ok) continue;
      const buf = Buffer.from(await imgResp.arrayBuffer());
      const ct = imgResp.headers.get("content-type") ?? "image/jpeg";
      return {
        url,
        b64: buf.toString("base64"),
        mediaType: (ct.split(";")[0] ?? "image/jpeg").trim(),
        sizeKb: Math.round(buf.length / 1024),
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchCommonsFile(
  file: string,
  thumbWidth?: number,
): Promise<FetchedImage | null> {
  try {
    const apiUrl =
      "https://commons.wikimedia.org/w/api.php?action=query&titles=" +
      encodeURIComponent(file) +
      "&prop=imageinfo&iiprop=url|mime|size" +
      (thumbWidth ? `&iiurlwidth=${thumbWidth}` : "") +
      "&format=json&origin=*";
    const resp = await fetch(apiUrl, { headers: { "User-Agent": UA } });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      query?: {
        pages?: Record<
          string,
          { imageinfo?: { url?: string; thumburl?: string; mime?: string }[] }
        >;
      };
    };
    const pages = Object.values(data.query?.pages ?? {});
    const info = pages[0]?.imageinfo?.[0];
    // Prefer thumburl when available (resized)
    const url = info?.thumburl ?? info?.url;
    if (!url) return null;

    const imgResp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!imgResp.ok) return null;
    const buf = Buffer.from(await imgResp.arrayBuffer());
    const mediaType = info?.mime ?? "image/jpeg";
    return {
      url,
      b64: buf.toString("base64"),
      mediaType: (mediaType.split(";")[0] ?? "image/jpeg").trim(),
      sizeKb: Math.round(buf.length / 1024),
    };
  } catch {
    return null;
  }
}

async function fetchImage(tc: TestCase): Promise<FetchedImage | null> {
  if (tc.source === "wikipedia" && tc.wikiTitle) {
    return fetchWikipediaThumbnail(tc.wikiTitle, tc.thumbnailWidth ?? 400);
  }
  if (tc.source === "commons" && tc.commonsFile) {
    return fetchCommonsFile(tc.commonsFile, tc.thumbnailWidth);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

interface ModelResult {
  model: string;
  testCaseId: string;
  ok: boolean;
  error?: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  extracted?: InventoryImport;
  scores: {
    bottleCountScore: number;
    versionIDScore: number;
    fillLevelScore: number;
    overallScore: number;
  };
}

function scoreResult(
  extracted: InventoryImport,
  expected: TestCase["expected"],
): ModelResult["scores"] {
  // Bottle count accuracy (40% weight): penalise proportionally per missed/extra bottle
  const countError = Math.abs(extracted.bottle_count - expected.bottleCount);
  const bottleCountScore = Math.max(
    0,
    100 - (countError / Math.max(expected.bottleCount, 1)) * 100,
  );

  // Version ID specificity (40% weight): specific = has both brand AND subcategory
  let versionIDScore = 0;
  if (extracted.bottles.length > 0) {
    let specificCount = 0;
    for (const b of extracted.bottles) {
      if (b.brand && b.subcategory) specificCount++;
    }
    versionIDScore = (specificCount / extracted.bottles.length) * 100;

    // Required brand detection bonus
    if (expected.mustContainBrands?.length) {
      let found = 0;
      for (const req of expected.mustContainBrands) {
        const detected = extracted.bottles.some((b) =>
          (b.product_name + " " + (b.brand ?? "")).toLowerCase().includes(req),
        );
        if (detected) found++;
      }
      const brandBonus = (found / expected.mustContainBrands.length) * 30;
      versionIDScore = Math.min(100, versionIDScore + brandBonus);
    }
  }

  // Fill level (20% weight): if expected, how many bottles have a fill estimate?
  let fillLevelScore = 100;
  if (expected.fillLevelExpected && extracted.bottles.length > 0) {
    const withFill = extracted.bottles.filter(
      (b) => b.fill_level_pct !== null || b.fill_label !== null,
    ).length;
    fillLevelScore = (withFill / extracted.bottles.length) * 100;
  }

  return {
    bottleCountScore: Math.round(bottleCountScore),
    versionIDScore: Math.round(versionIDScore),
    fillLevelScore: Math.round(fillLevelScore),
    overallScore: Math.round(
      bottleCountScore * 0.4 + versionIDScore * 0.4 + fillLevelScore * 0.2,
    ),
  };
}

// ---------------------------------------------------------------------------
// Main evaluation runner
// ---------------------------------------------------------------------------

async function runEval(opts: { models?: string[]; outPath?: string }) {
  const models = opts.models ?? [
    "anthropic/claude-sonnet-4",
    "anthropic/claude-haiku-4-5",
    "google/gemini-2.5-flash",
    "openai/gpt-4o",
  ];

  // Load API key
  const keyPath = join(homedir(), ".ai_gateway_api_key");
  const apiKey =
    process.env.AI_GATEWAY_API_KEY ??
    (existsSync(keyPath) ? readFileSync(keyPath, "utf8").trim() : null);
  if (!apiKey) {
    console.error("AI_GATEWAY_API_KEY not set and ~/.ai_gateway_api_key missing");
    process.exit(1);
  }

  const gateway = createGateway({ apiKey });
  const results: ModelResult[] = [];
  const imageCache = new Map<string, FetchedImage>();

  console.log(`\n=== Backbar Vision Model Benchmark ===`);
  console.log(`Models : ${models.join(", ")}`);
  console.log(`Cases  : ${TEST_CASES.length}\n`);

  // Pre-fetch all test images
  console.log("Fetching test images...");
  for (const tc of TEST_CASES) {
    process.stdout.write(`  [${tc.id}] `);
    const img = await fetchImage(tc);
    if (img) {
      imageCache.set(tc.id, img);
      console.log(`ok  ${img.sizeKb}KB  ${img.mediaType}`);
    } else {
      console.log(`SKIP — could not fetch`);
    }
  }
  console.log();

  const SYSTEM_PROMPT =
    "You are cataloging spirits visible in a bar photo for home-bar inventory management. " +
    "For EVERY bottle visible, identify: full product name (brand + expression, not just category), " +
    "spirit category, subcategory, fill level (percentage 0-100 or coarse label), " +
    "and ABV if printed on the label. " +
    "Be as specific as possible from the label — 'Maker's Mark Bourbon Whisky' beats 'whisky'. " +
    "Count every distinct bottle you can see, even partially visible ones. " +
    "Return null for fields genuinely unreadable from the image.";

  for (const modelId of models) {
    console.log(`\n--- ${modelId} ---`);
    for (const tc of TEST_CASES) {
      const img = imageCache.get(tc.id);
      if (!img) {
        console.log(`  [${tc.id}] SKIP (no image)`);
        results.push({
          model: modelId,
          testCaseId: tc.id,
          ok: false,
          error: "image-unavailable",
          latencyMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          scores: { bottleCountScore: 0, versionIDScore: 0, fillLevelScore: 0, overallScore: 0 },
        });
        continue;
      }

      process.stdout.write(`  [${tc.id}] `);
      const start = Date.now();
      try {
        const { object, usage } = await generateObject({
          model: gateway(modelId),
          schema: InventoryImport,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  image: img.b64,
                  mimeType: img.mediaType,
                } as { type: "image"; image: string; mimeType: string },
                { type: "text", text: "Catalog every bottle visible in this image." },
              ],
            },
          ],
        });
        const latencyMs = Date.now() - start;
        const scores = scoreResult(object, tc.expected);
        results.push({
          model: modelId,
          testCaseId: tc.id,
          ok: true,
          latencyMs,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          extracted: object,
          scores,
        });
        console.log(
          `count=${object.bottle_count}  overall=${scores.overallScore}/100  ${latencyMs}ms  tok=${usage?.totalTokens ?? "?"}`,
        );
      } catch (err) {
        const latencyMs = Date.now() - start;
        const errMsg = (err as Error).message.slice(0, 140);
        results.push({
          model: modelId,
          testCaseId: tc.id,
          ok: false,
          error: errMsg,
          latencyMs,
          inputTokens: 0,
          outputTokens: 0,
          scores: { bottleCountScore: 0, versionIDScore: 0, fillLevelScore: 0, overallScore: 0 },
        });
        console.log(`FAIL  ${errMsg}`);
      }
    }
  }

  // Aggregate per-model scores
  console.log("\n\n=== Results Summary ===\n");

  type Summary = {
    avgOverall: number;
    avgBottleCount: number;
    avgVersionID: number;
    avgFillLevel: number;
    avgLatencyMs: number;
    avgTokens: number;
    failCount: number;
    okCount: number;
  };
  const modelSummary: Record<string, Summary> = {};

  const avg = (arr: number[]) =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  for (const model of models) {
    const ok = results.filter((r) => r.model === model && r.ok);
    const all = results.filter((r) => r.model === model);
    modelSummary[model] = {
      avgOverall: avg(ok.map((r) => r.scores.overallScore)),
      avgBottleCount: avg(ok.map((r) => r.scores.bottleCountScore)),
      avgVersionID: avg(ok.map((r) => r.scores.versionIDScore)),
      avgFillLevel: avg(ok.map((r) => r.scores.fillLevelScore)),
      avgLatencyMs: avg(ok.map((r) => r.latencyMs)),
      avgTokens: avg(ok.map((r) => r.inputTokens + r.outputTokens)),
      failCount: all.filter((r) => !r.ok).length,
      okCount: ok.length,
    };
  }

  const p = (s: string | number, n: number) => String(s).padStart(n);
  console.log(
    `${"Model".padEnd(42)} | Overall | Count | VersionID | Fill | Lat(ms) | Tokens | Fails`,
  );
  console.log("-".repeat(112));
  for (const [model, s] of Object.entries(modelSummary)) {
    if (s.okCount === 0) {
      console.log(`${model.padEnd(42)} | ${p("N/A", 7)} | (all failed)`);
      continue;
    }
    console.log(
      `${model.padEnd(42)} | ${p(s.avgOverall, 7)} | ${p(s.avgBottleCount, 5)} | ${p(s.avgVersionID, 9)} | ${p(s.avgFillLevel, 4)} | ${p(s.avgLatencyMs, 7)} | ${p(s.avgTokens, 6)} | ${s.failCount}`,
    );
  }

  // Per-test detail
  console.log("\n\n=== Per-Test Details ===");
  for (const tc of TEST_CASES) {
    console.log(`\n[${tc.id}] ${tc.description}`);
    console.log(
      `  Expected: ${tc.expected.bottleCount} bottles, fill=${tc.expected.fillLevelExpected}, brands=${tc.expected.mustContainBrands ?? "any"}`,
    );
    for (const r of results.filter((x) => x.testCaseId === tc.id)) {
      if (!r.ok) {
        console.log(`  ${r.model}: FAIL — ${r.error}`);
        continue;
      }
      console.log(`  ${r.model}:`);
      console.log(
        `    count=${r.extracted?.bottle_count}  scores=${JSON.stringify(r.scores)}  ${r.latencyMs}ms`,
      );
      for (const b of (r.extracted?.bottles ?? []).slice(0, 4)) {
        const fill = b.fill_level_pct !== null ? `${b.fill_level_pct}%` : (b.fill_label ?? "?");
        console.log(
          `      "${b.product_name}" cat=${b.category ?? "?"} sub=${b.subcategory ?? "?"} fill=${fill} conf=${b.confidence}`,
        );
      }
      if ((r.extracted?.bottles.length ?? 0) > 4) {
        console.log(`      ... (${(r.extracted?.bottles.length ?? 0) - 4} more)`);
      }
    }
  }

  const output = {
    timestamp: new Date().toISOString(),
    models,
    testCases: TEST_CASES.map((tc) => ({
      id: tc.id,
      description: tc.description,
      source: tc.source,
      imageUrl: imageCache.get(tc.id)?.url ?? null,
      sizeKb: imageCache.get(tc.id)?.sizeKb ?? null,
      expected: tc.expected,
    })),
    results,
    summary: modelSummary,
  };

  if (opts.outPath) {
    writeFileSync(opts.outPath, JSON.stringify(output, null, 2));
    console.log(`\nResults JSON → ${opts.outPath}`);
  }

  return output;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const modelsArg = args.find((a) => a.startsWith("--models="))?.slice(9);
const outArg = args.find((a) => a.startsWith("--out="))?.slice(6);

runEval({
  models: modelsArg ? modelsArg.split(",") : undefined,
  outPath: outArg ?? join(import.meta.dir, "bench-results.json"),
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
