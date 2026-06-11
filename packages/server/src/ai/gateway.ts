import { createGateway } from "@ai-sdk/gateway";
import type { LanguageModel } from "ai";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * AI Gateway wiring (spec ai-engine.md §1, backbar-architecture-spec.md §0/§3).
 *
 * All AI calls route through the Vercel AI Gateway — model routing,
 * observability, and spend live there. No provider SDK keys in the app.
 *
 * Bootstraps `AI_GATEWAY_API_KEY` from `~/.ai_gateway_api_key` if the env
 * var isn't already set (per host operator workflow).
 *
 * Model IDs follow `provider/model-name` format routed via the gateway.
 * Every model constant below can be overridden at runtime by setting the
 * corresponding env var — no code change needed when switching models.
 *
 *   IDEATE_MODEL              — recipe generation / riff (default: claude-sonnet-4)
 *   VISION_MODEL              — recipe photo import / OCR (default: claude-sonnet-4)
 *   INVENTORY_IMPORT_MODEL    — bar-photo bottle detection (default: gpt-4o)
 *   LOOKUP_MODEL              — product metadata enrichment (default: claude-haiku-4-5)
 *
 * See specs/model-evaluation-vision.md for the evaluation that drove the
 * INVENTORY_IMPORT_MODEL default choice.
 */

const HOME_KEY_PATH = join(homedir(), ".ai_gateway_api_key");

/**
 * Returns the gateway API key, bootstrapping `process.env.AI_GATEWAY_API_KEY`
 * from `~/.ai_gateway_api_key` if the env var isn't set. Returns null when
 * neither source has a key (callers should degrade to `503 ai-disabled`).
 *
 * Calling this is idempotent and cheap — it mutates `process.env` once on
 * first successful read so downstream code can keep using `process.env`.
 */
export function bootstrapGatewayKey(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.AI_GATEWAY_API_KEY) return env.AI_GATEWAY_API_KEY;
  if (existsSync(HOME_KEY_PATH)) {
    try {
      const key = readFileSync(HOME_KEY_PATH, "utf8").trim();
      if (key) {
        env.AI_GATEWAY_API_KEY = key;
        return key;
      }
    } catch {
      // fall through to null
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Model ID defaults — each overridable by env var at runtime
// ---------------------------------------------------------------------------

/** Recipe generation and riff mode. Override: IDEATE_MODEL */
export const DEFAULT_MODEL =
  process.env.IDEATE_MODEL ?? "anthropic/claude-sonnet-4";

/** Recipe photo import (OCR from book pages / recipe cards). Override: VISION_MODEL */
export const DEFAULT_VISION_MODEL =
  process.env.VISION_MODEL ?? "anthropic/claude-sonnet-4";

/**
 * Bar-photo bulk inventory import (bottle detection + fill level).
 * Evaluated 2025-06-11; openai/gpt-4o scored highest (90/100 overall,
 * 2.3s latency, 970 tokens) vs claude-sonnet-4 (83, 7.8s), gemini-2.5-flash (85, 12.7s),
 * claude-haiku-4-5 (82 single/27 multi-bottle).
 * Override: INVENTORY_IMPORT_MODEL
 */
export const DEFAULT_INVENTORY_IMPORT_MODEL =
  process.env.INVENTORY_IMPORT_MODEL ?? "openai/gpt-4o";

/** Product metadata enrichment — cheap + fast text-only extractions. Override: LOOKUP_MODEL */
export const DEFAULT_LOOKUP_MODEL =
  process.env.LOOKUP_MODEL ?? "anthropic/claude-haiku-4-5";

// ---------------------------------------------------------------------------
// Gateway singleton
// ---------------------------------------------------------------------------

/**
 * Lazily-constructed gateway provider. Tests may pass a fake `LanguageModel`
 * directly into AI functions, bypassing the gateway entirely.
 */
let cached: { gateway: ReturnType<typeof createGateway>; apiKey: string } | null = null;

export function getGateway() {
  const apiKey = bootstrapGatewayKey();
  if (!apiKey) return null;
  if (!cached || cached.apiKey !== apiKey) {
    cached = { gateway: createGateway({ apiKey }), apiKey };
  }
  return cached.gateway;
}

export function getDefaultModel(): LanguageModel | null {
  const gw = getGateway();
  return gw ? gw(DEFAULT_MODEL) : null;
}

export function getVisionModel(): LanguageModel | null {
  const gw = getGateway();
  return gw ? gw(DEFAULT_VISION_MODEL) : null;
}

/** Model for bar-photo bulk inventory import. See DEFAULT_INVENTORY_IMPORT_MODEL. */
export function getInventoryImportModel(): LanguageModel | null {
  const gw = getGateway();
  return gw ? gw(DEFAULT_INVENTORY_IMPORT_MODEL) : null;
}

export function getLookupModel(): LanguageModel | null {
  const gw = getGateway();
  return gw ? gw(DEFAULT_LOOKUP_MODEL) : null;
}
