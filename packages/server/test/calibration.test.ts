import { describe, expect, test } from "bun:test";
import { sensorChannels as channelsRepo } from "@backbar/db";
import { handleMqttMessage, topicFor } from "../src/mqtt";
import { call, setup } from "./_helpers";

const READING = (channel: number, raw_g: number, ts?: number) =>
  JSON.stringify({ channel, raw_g, ts: ts ?? Date.now() });

describe("RawSampleCache + sample endpoints", () => {
  test("MQTT reading writes to cache even for unmapped channels", () => {
    const { deps } = setup();
    handleMqttMessage(deps, topicFor("dev-1", "reading"), READING(99, 1234.5));
    const sample = deps.rawSamples.get("dev-1", 99);
    expect(sample).not.toBeNull();
    expect(sample?.raw_g).toBe(1234.5);
  });

  test("GET /nodes/:device_id/channels/:channel/sample returns latest", async () => {
    const { app, deps } = setup();
    handleMqttMessage(deps, topicFor("dev-1", "reading"), READING(0, 873.1));
    const res = await call(app, "GET", "/nodes/dev-1/channels/0/sample");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.raw_g).toBe(873.1);
    expect(body.device_id).toBe("dev-1");
    expect(body.channel).toBe(0);
  });

  test("GET /sample 404s with no-sample before any reading", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/nodes/dev-1/channels/0/sample");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("no-sample");
  });

  test("GET /bottles/:id/sample returns the bottle's channel sample", async () => {
    const { app, deps } = setup();
    handleMqttMessage(deps, topicFor("dev-1", "reading"), READING(0, 1322.4));
    const res = await call(app, "GET", "/bottles/b-rum/sample");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.raw_g).toBe(1322.4);
    expect(body.channel.device_id).toBe("dev-1");
  });

  test("GET /bottles/:id/sample 404s no-channel for manual bottles", async () => {
    const { app } = setup();
    const res = await call(app, "GET", "/bottles/b-lime/sample");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("no-channel");
  });
});

describe("POST /nodes/:device_id/calibrate/reset", () => {
  test("sets identity cal and surfaces it for next push", async () => {
    const { app, db } = setup();
    // Pre-condition: setup() wires dev-1/0 with slope=1 offset=0 already — flip them so reset is observable.
    channelsRepo(db).upsert({
      device_id: "dev-1",
      channel: 0,
      slot: "shelf-a-1",
      bottle_id: "b-rum",
      cal_slope: 0.0123,
      cal_offset: -456,
    });

    const res = await call(app, "POST", "/nodes/dev-1/calibrate/reset", { channel: 0 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("identity");
    expect(body.channel.cal_slope).toBe(1);
    expect(body.channel.cal_offset).toBe(0);

    const persisted = channelsRepo(db).list().find((c) => c.device_id === "dev-1" && c.channel === 0);
    expect(persisted?.cal_slope).toBe(1);
    expect(persisted?.cal_offset).toBe(0);
  });

  test("reset 404s for an unknown channel", async () => {
    const { app } = setup();
    const res = await call(app, "POST", "/nodes/dev-1/calibrate/reset", { channel: 999 });
    expect(res.status).toBe(404);
  });

  test("validates body", async () => {
    const { app } = setup();
    const res = await call(app, "POST", "/nodes/dev-1/calibrate/reset", { channel: -1 });
    expect(res.status).toBe(400);
  });
});

describe("ingest.resolveWeight — server no longer re-applies cal", () => {
  test("raw_g is treated as already-cal'd gross grams (spec §2)", async () => {
    const { db, deps } = setup();
    const { bottles } = await import("@backbar/db");

    // Pre-condition: park the channel with absurd slope/offset. If the server
    // were still re-applying cal, the bottle level would diverge wildly.
    channelsRepo(db).upsert({
      device_id: "dev-1",
      channel: 0,
      slot: "shelf-a-1",
      bottle_id: "b-rum",
      cal_slope: 999,
      cal_offset: -77777,
    });

    // Firmware sends raw_g = 1300 (= bottle tare 500g + ~800g of spirit).
    // Server math: gross=1300, net=1300−500=800g, density=0.95 → 842ml,
    //              clamped to full_ml=750.
    handleMqttMessage(deps, topicFor("dev-1", "reading"), READING(0, 1300));
    const updated = bottles(db).get("b-rum")!;
    expect(updated.level_ml).toBe(750);
  });

  test("identity cal mode (slope=1, offset=0) leaves raw_g unchanged", async () => {
    const { db, deps } = setup();
    const { bottles } = await import("@backbar/db");

    // Tare empty bottle (no liquid). With slope=1 offset=0 and raw_g=500 (just
    // the tare on the cell), expect level_ml = 0.
    handleMqttMessage(deps, topicFor("dev-1", "reading"), READING(0, 500));
    const updated = bottles(db).get("b-rum")!;
    expect(updated.level_ml).toBe(0);
  });
});
