import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { applyReading } from "../src/ingest";
import { serve } from "../src/serve";
import { setup } from "./_helpers";

describe("serve() — Bun.serve mounts REST + WS /live", () => {
  const ctx = setup();
  // Port 0 → kernel picks a free port; works for parallel test runs.
  const server = serve(ctx.app, ctx.deps, 0);

  beforeAll(() => {
    // no-op; Bun.serve is sync.
  });
  afterAll(() => {
    server.stop(true);
  });

  test("REST routes are served", async () => {
    const res = await fetch(`http://localhost:${server.port}/products`);
    expect(res.status).toBe(200);
  });

  test("WS /live receives a hello + reading.updated when ingest fires", async () => {
    const ws = new WebSocket(`ws://localhost:${server.port}/live`);
    const messages: unknown[] = [];

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("ws never opened")), 1000);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = (e) => {
        clearTimeout(timer);
        reject(new Error(`ws error: ${String(e)}`));
      };
    });

    ws.onmessage = (e) => {
      messages.push(JSON.parse(e.data as string));
    };

    // Wait one microtask + coalesce window after triggering the reading.
    applyReading(ctx.deps, { kind: "manual", bottle_id: "b-rum", level_ml: 600 });
    await new Promise((r) => setTimeout(r, 400));

    ws.close();
    const types = messages.map((m) => (m as { type: string }).type);
    expect(types).toContain("hello");
    expect(types).toContain("reading.updated");
  });
});
