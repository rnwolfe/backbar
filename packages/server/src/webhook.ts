import { z } from "zod";
import { bottles as bottlesRepo, products as productsRepo, type DB } from "@backbar/db";
import type { Bus, LiveEvent } from "./bus";

export const WebhookCfg = z.object({
  url: z.string().url(),
  method: z.enum(["POST", "PUT"]).default("POST"),
  headers: z.record(z.string()).default({}),
  body_template: z.string().min(1),
  /** Which events to forward. Defaults to lowstock crossings only. */
  events: z.array(z.enum(["lowstock.crossed", "node.status"])).default(["lowstock.crossed"]),
});
export type WebhookCfg = z.infer<typeof WebhookCfg>;

/**
 * Parse `WEBHOOK_*` env into a config or null.
 *
 *   WEBHOOK_URL          required to enable
 *   WEBHOOK_METHOD       POST|PUT (default POST)
 *   WEBHOOK_HEADERS      JSON {string: string}
 *   WEBHOOK_BODY         template; supports {{bottle}} {{level_ml}} {{pct}} {{event}}
 *   WEBHOOK_EVENTS       comma-separated event list
 */
export function fromEnv(env: NodeJS.ProcessEnv = process.env): WebhookCfg | null {
  if (!env.WEBHOOK_URL) return null;
  const headers = env.WEBHOOK_HEADERS ? JSON.parse(env.WEBHOOK_HEADERS) : {};
  const events = env.WEBHOOK_EVENTS
    ? env.WEBHOOK_EVENTS.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  return WebhookCfg.parse({
    url: env.WEBHOOK_URL,
    method: env.WEBHOOK_METHOD ?? "POST",
    headers,
    body_template: env.WEBHOOK_BODY ?? '{"text":"{{event}} {{bottle}} {{level_ml}} ml ({{pct}}%)"}',
    events,
  });
}

function template(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
}

/**
 * Render template variables for a given event using current DB state where
 * relevant. Always sets `{{event}}`; lowstock crossings get `{{bottle}}`,
 * `{{level_ml}}`, `{{pct}}`.
 */
function renderVars(db: DB, ev: LiveEvent): Record<string, string | number> {
  if (ev.type === "lowstock.crossed") {
    const b = bottlesRepo(db).get(ev.bottle_id);
    const productName = b ? productsRepo(db).get(b.product_id)?.name ?? b.product_id : ev.bottle_id;
    const pct = b ? Math.round((b.level_ml / b.full_ml) * 100) : 0;
    return { event: ev.type, bottle: productName, level_ml: Math.round(ev.level_ml), pct };
  }
  if (ev.type === "node.status") {
    return { event: ev.type, bottle: "", level_ml: 0, pct: 0, device: ev.device_id, status: ev.status };
  }
  return { event: ev.type, bottle: "", level_ml: 0, pct: 0 };
}

/**
 * Wire webhook delivery into the bus. Fire-and-forget — never blocks ingest.
 * On non-2xx, log + retry once with a 250 ms backoff. Returns the disposer.
 */
export function attachWebhook(bus: Bus, db: DB, cfg: WebhookCfg): () => void {
  const send = async (ev: LiveEvent) => {
    if (!cfg.events.includes(ev.type as (typeof cfg.events)[number])) return;
    const body = template(cfg.body_template, renderVars(db, ev));
    try {
      const res = await fetch(cfg.url, {
        method: cfg.method,
        headers: { "content-type": "application/json", ...cfg.headers },
        body,
      });
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 250));
        const retry = await fetch(cfg.url, {
          method: cfg.method,
          headers: { "content-type": "application/json", ...cfg.headers },
          body,
        });
        if (!retry.ok) console.warn(`[webhook] non-2xx after retry: ${retry.status}`);
      }
    } catch (err) {
      console.warn("[webhook] delivery failed", err);
    }
  };

  return bus.on((e) => {
    void send(e);
  });
}
