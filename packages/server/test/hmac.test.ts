import { describe, expect, test } from "bun:test";
import { HMAC_HEADER, signBody, verifySignature } from "../src/hmac";
import { call, setup } from "./_helpers";

describe("HMAC — X-Backbar-Sig", () => {
  test("verifySignature accepts a body signed with the shared secret", () => {
    const body = JSON.stringify({ hello: "world" });
    const sig = signBody(body, "secret");
    expect(verifySignature(body, "secret", sig)).toBe(true);
  });

  test("verifySignature rejects missing header / wrong secret / tampered body", () => {
    const body = JSON.stringify({ hello: "world" });
    const sig = signBody(body, "secret");
    expect(verifySignature(body, "secret", null)).toBe(false);
    expect(verifySignature(body, "wrong", sig)).toBe(false);
    expect(verifySignature(body + " ", "secret", sig)).toBe(false);
  });

  test("/ingest/reading (weight) requires HMAC when secret is configured", async () => {
    const { app } = setup({ HMAC_SECRET: "secret" });
    const body = { device_id: "dev-1", channel: 0, raw_g: 1000, ts: 1 };
    const raw = JSON.stringify(body);
    const noSig = await call(app, "POST", "/ingest/reading", raw);
    expect(noSig.status).toBe(401);
    const goodSig = await call(app, "POST", "/ingest/reading", raw, {
      [HMAC_HEADER]: signBody(raw, "secret"),
    });
    expect(goodSig.status).toBe(200);
  });

  test("/ingest/reading (weight) returns 503 unconfigured when no HMAC secret set", async () => {
    const { app } = setup();
    const res = await call(app, "POST", "/ingest/reading", {
      device_id: "dev-1",
      channel: 0,
      raw_g: 1000,
      ts: 1,
    });
    expect(res.status).toBe(503);
  });

  test("/ingest/reading (manual) does NOT require HMAC", async () => {
    const { app } = setup({ HMAC_SECRET: "secret" });
    const res = await call(app, "POST", "/ingest/reading", { bottle_id: "b-rum", level_ml: 500 });
    expect(res.status).toBe(200);
  });

  test("/ingest/reading weight with unmapped channel returns 409", async () => {
    const { app } = setup({ HMAC_SECRET: "secret" });
    const body = { device_id: "dev-1", channel: 99, raw_g: 1000, ts: 1 };
    const raw = JSON.stringify(body);
    const res = await call(app, "POST", "/ingest/reading", raw, {
      [HMAC_HEADER]: signBody(raw, "secret"),
    });
    expect(res.status).toBe(409);
  });
});
