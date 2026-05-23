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

export const DEFAULT_MODEL = "anthropic/claude-sonnet-4";
export const DEFAULT_VISION_MODEL = "anthropic/claude-sonnet-4";

/**
 * Lazily-constructed gateway provider. Tests may pass a fake `LanguageModel`
 * directly into `ideate`/`importPhoto`, bypassing the gateway entirely.
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
