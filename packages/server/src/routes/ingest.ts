import { Hono } from "hono";
import { z } from "zod";
import { ManualReading, WeightReading } from "@backbar/core";
import type { Deps } from "../deps";
import { err } from "../errors";
import { HMAC_HEADER, verifySignature } from "../hmac";
import { applyReading, IngestError, type IngestInput } from "../ingest";

/**
 * Discriminated union — the body is one of two shapes; manual readings need
 * no HMAC, weight readings (from firmware) require it.
 *
 * `kind` is inferred from payload shape: a `device_id`+`channel`+`raw_g`
 * triple is a weight reading; anything else is treated as manual.
 */
const Body = z.union([
  z.object({ kind: z.literal("manual") }).and(ManualReading).and(z.object({ ts: z.number().int().optional() })),
  z.object({ kind: z.literal("weight") }).and(WeightReading),
  ManualReading.and(z.object({ ts: z.number().int().optional() })),
  WeightReading,
]);

function classify(parsed: z.infer<typeof Body>): IngestInput {
  if ("device_id" in parsed && "raw_g" in parsed) {
    return { kind: "weight", device_id: parsed.device_id, channel: parsed.channel, raw_g: parsed.raw_g, ts: parsed.ts };
  }
  if ("bottle_id" in parsed) {
    return parsed.ts != null
      ? { kind: "manual", bottle_id: parsed.bottle_id, level_ml: parsed.level_ml, ts: parsed.ts }
      : { kind: "manual", bottle_id: parsed.bottle_id, level_ml: parsed.level_ml };
  }
  throw new Error("unreachable — Zod guarantees one branch");
}

export function ingestRouter(deps: Deps) {
  const r = new Hono();

  r.post("/reading", async (c) => {
    const raw = await c.req.text();

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return err(c, 400, "validation", "invalid JSON body");
    }
    const parsed = Body.safeParse(body);
    if (!parsed.success) return err(c, 400, "validation", parsed.error.issues);

    const input = classify(parsed.data);

    // Weight readings come from firmware over LAN — HMAC required (§api §2).
    if (input.kind === "weight") {
      if (!deps.hmacSecret) {
        return err(c, 503, "unconfigured", "HMAC_SECRET not set; weight ingest disabled");
      }
      const sig = c.req.header(HMAC_HEADER);
      if (!verifySignature(raw, deps.hmacSecret, sig ?? null)) {
        return err(c, 401, "bad-signature");
      }
    }

    try {
      const result = applyReading(deps, input);
      return c.json({ ok: true, reading_id: result.reading.id, level_ml: result.bottle.level_ml });
    } catch (e) {
      if (e instanceof IngestError && e.code === "unmapped-channel") {
        return err(c, 409, "unmapped channel", e.message);
      }
      if (e instanceof IngestError && e.code === "unknown-bottle") {
        return err(c, 404, "not-found", e.message);
      }
      if (e instanceof IngestError) {
        return err(c, 422, e.code, e.message);
      }
      throw e;
    }
  });

  return r;
}
