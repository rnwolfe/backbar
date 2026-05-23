import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { attachWebhook, WebhookCfg } from "../src/webhook";
import { setup } from "./_helpers";

interface Captured {
  url: string;
  method: string;
  body: string;
}

let captured: Captured[] = [];
let realFetch: typeof globalThis.fetch;

beforeEach(() => {
  captured = [];
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    captured.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : "",
    });
    return new Response("ok", { status: 200 });
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("webhook adapter (spec §0 / api.md §5)", () => {
  test("fires on lowstock.crossed with rendered template", async () => {
    const { db, deps } = setup();
    attachWebhook(
      deps.bus,
      db,
      WebhookCfg.parse({
        url: "https://example.test/hook",
        body_template: "{{event}}|{{bottle}}|{{level_ml}}|{{pct}}",
        events: ["lowstock.crossed"],
      }),
    );

    deps.bus.emit({ type: "lowstock.crossed", bottle_id: "b-rum", level_ml: 40 });
    // Fire-and-forget — give the microtask queue a turn.
    await new Promise((r) => setTimeout(r, 10));

    expect(captured.length).toBe(1);
    expect(captured[0]!.url).toBe("https://example.test/hook");
    const [event, bottle, level_ml, pct] = captured[0]!.body.split("|");
    expect(event).toBe("lowstock.crossed");
    expect(bottle).toBe("Generic Rum");
    expect(Number(level_ml)).toBe(40);
    expect(Number(pct)).toBeGreaterThanOrEqual(0);
  });

  test("fires on node.status when events list includes it (offline notification)", async () => {
    const { db, deps } = setup();
    attachWebhook(
      deps.bus,
      db,
      WebhookCfg.parse({
        url: "https://example.test/hook",
        body_template: '{"event":"{{event}}","device":"{{device}}","status":"{{status}}"}',
        events: ["node.status"],
      }),
    );

    deps.bus.emit({
      type: "node.status",
      device_id: "dev-2",
      status: "offline",
      last_seen: 12345,
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(captured.length).toBe(1);
    expect(captured[0]!.body).toBe(
      '{"event":"node.status","device":"dev-2","status":"offline"}',
    );
  });

  test("skips events not in the configured list", async () => {
    const { db, deps } = setup();
    attachWebhook(
      deps.bus,
      db,
      WebhookCfg.parse({
        url: "https://example.test/hook",
        body_template: "{{event}}",
        events: ["lowstock.crossed"], // node.status NOT subscribed
      }),
    );

    deps.bus.emit({
      type: "node.status",
      device_id: "dev-2",
      status: "offline",
      last_seen: 1,
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(captured.length).toBe(0);
  });
});
