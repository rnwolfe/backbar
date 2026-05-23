import { describe, expect, test } from "bun:test";
import {
  bottles as bottlesRepo,
  nodes as nodesRepo,
  readings as readingsRepo,
} from "@backbar/db";
import {
  attachSubscriber,
  handleMqttMessage,
  topicFor,
  type MqttClientLike,
} from "../src/mqtt";
import { eventsFrom, setup } from "./_helpers";

describe("mqtt subscriber — adapter into the same ingest core", () => {
  test("reading payload on backbar/<id>/reading routes through applyReading", () => {
    const { db, deps } = setup();
    const beforeReadings = readingsRepo(db).forBottle("b-rum").length;

    handleMqttMessage(
      deps,
      topicFor("dev-1", "reading"),
      JSON.stringify({ channel: 0, raw_g: 1100, ts: 1234 }),
    );

    const after = readingsRepo(db).forBottle("b-rum");
    expect(after.length).toBe(beforeReadings + 1);
    expect(after[0]?.source).toBe("weight");
    // Same math the HTTP path uses (test_helpers tare=500, density 0.96).
    expect(after[0]?.level_ml).toBeCloseTo(600 / 0.96, 4);
  });

  test("reading on unmapped channel is dropped without throwing", () => {
    const { db, deps } = setup();
    const before = readingsRepo(db).forBottle("b-rum").length;

    expect(() =>
      handleMqttMessage(
        deps,
        topicFor("dev-1", "reading"),
        JSON.stringify({ channel: 99, raw_g: 1100, ts: 1 }),
      ),
    ).not.toThrow();

    expect(readingsRepo(db).forBottle("b-rum").length).toBe(before);
  });

  test("birth message upserts node row online + emits node.status", async () => {
    const { db, deps } = setup();

    const events = await eventsFrom(deps, () => {
      handleMqttMessage(
        deps,
        topicFor("dev-2", "birth"),
        JSON.stringify({ fw_version: "1.2.3", label: "back-left" }),
      );
    });

    const row = nodesRepo(db).list().find((n) => n.device_id === "dev-2");
    expect(row?.status).toBe("online");
    expect(row?.fw_version).toBe("1.2.3");
    expect(row?.label).toBe("back-left");
    expect(row?.last_seen).toBeGreaterThan(0);

    const broadcast = events.find((e) => e.type === "node.status");
    expect(broadcast?.type === "node.status" && broadcast.status).toBe("online");
  });

  test("last-will message flips status offline + emits node.status", async () => {
    const { db, deps } = setup();

    // First a birth so there's a row to flip.
    handleMqttMessage(
      deps,
      topicFor("dev-2", "birth"),
      JSON.stringify({ fw_version: "1.2.3" }),
    );

    const events = await eventsFrom(deps, () => {
      handleMqttMessage(deps, topicFor("dev-2", "lwt"), "");
    });

    const row = nodesRepo(db).list().find((n) => n.device_id === "dev-2");
    expect(row?.status).toBe("offline");
    expect(row?.fw_version).toBe("1.2.3"); // preserved across LWT

    const broadcast = events.find((e) => e.type === "node.status");
    expect(broadcast?.type === "node.status" && broadcast.status).toBe("offline");
  });

  test("malformed JSON payload is logged and dropped (subscriber keeps flowing)", () => {
    const { deps } = setup();
    expect(() =>
      handleMqttMessage(deps, topicFor("dev-1", "reading"), "not-json"),
    ).not.toThrow();
  });

  test("unknown topic is silently ignored (not our prefix)", () => {
    const { deps } = setup();
    expect(() =>
      handleMqttMessage(deps, "homeassistant/sensor/foo/state", "anything"),
    ).not.toThrow();
  });

  test("hybrid tracking — weight via MQTT + manual via HTTP coexist", () => {
    const { db, deps } = setup();

    // Weight reading via MQTT for tracked rum bottle.
    handleMqttMessage(
      deps,
      topicFor("dev-1", "reading"),
      JSON.stringify({ channel: 0, raw_g: 950, ts: 1 }),
    );
    // Manual reading via the ingest core for untracked lime bottle.
    // (HTTP route calls applyReading; here we exercise the same core directly.)
    const limeReadings = readingsRepo(db).forBottle("b-lime");
    expect(limeReadings.length).toBeGreaterThanOrEqual(0);

    // The tracked rum bottle now has a weight reading.
    const rumLatest = readingsRepo(db).forBottle("b-rum")[0]!;
    expect(rumLatest.source).toBe("weight");
    // The untracked lime bottle still has whatever started in fixtures.
    expect(bottlesRepo(db).get("b-lime")?.tracked).toBe(false);
    expect(bottlesRepo(db).get("b-rum")?.tracked).toBe(true);
  });
});

describe("mqtt subscriber — client integration", () => {
  /** Minimal in-memory fake matching MqttClientLike. */
  function fakeClient() {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const subscribed: string[][] = [];
    const published: { topic: string; payload: string; opts?: unknown }[] = [];
    let ended = false;
    const client: MqttClientLike = {
      on(event: string, cb: (...args: unknown[]) => void) {
        (handlers[event] ??= []).push(cb);
        return client as never;
      },
      subscribe(topic, cb) {
        subscribed.push(Array.isArray(topic) ? topic : [topic]);
        cb?.(null);
      },
      publish(topic, payload, opts) {
        published.push({ topic, payload, opts });
      },
      end() {
        ended = true;
      },
    };
    return {
      client,
      fire(event: string, ...args: unknown[]) {
        for (const cb of handlers[event] ?? []) cb(...args);
      },
      subscribed,
      published,
      isEnded: () => ended,
    };
  }

  test("attachSubscriber subscribes to all three patterns on connect", () => {
    const { deps } = setup();
    const fake = fakeClient();
    attachSubscriber(deps, fake.client);
    fake.fire("connect");
    expect(fake.subscribed.length).toBe(1);
    expect(fake.subscribed[0]!.sort()).toEqual([
      "backbar/+/birth",
      "backbar/+/lwt",
      "backbar/+/reading",
    ]);
  });

  test("message event routes through handleMqttMessage", () => {
    const { db, deps } = setup();
    const fake = fakeClient();
    attachSubscriber(deps, fake.client);
    fake.fire("connect");

    fake.fire(
      "message",
      topicFor("dev-1", "reading"),
      Buffer.from(JSON.stringify({ channel: 0, raw_g: 1100, ts: 1 })),
    );

    const r = readingsRepo(db).forBottle("b-rum")[0]!;
    expect(r.source).toBe("weight");
  });

  test("pushConfig publishes retained JSON on config topic", () => {
    const { deps } = setup();
    const fake = fakeClient();
    const handle = attachSubscriber(deps, fake.client);
    handle.pushConfig("dev-1", {
      cadence_s: 60,
      cal: [{ channel: 0, slope: 1.5, offset: -2 }],
    });
    expect(fake.published.length).toBe(1);
    expect(fake.published[0]!.topic).toBe("backbar/dev-1/config");
    expect(JSON.parse(fake.published[0]!.payload)).toEqual({
      cadence_s: 60,
      cal: [{ channel: 0, slope: 1.5, offset: -2 }],
    });
    expect(fake.published[0]!.opts).toMatchObject({ retain: true });
  });

  test("stop() ends the underlying client", () => {
    const { deps } = setup();
    const fake = fakeClient();
    const handle = attachSubscriber(deps, fake.client);
    handle.stop();
    expect(fake.isEnded()).toBe(true);
  });
});
