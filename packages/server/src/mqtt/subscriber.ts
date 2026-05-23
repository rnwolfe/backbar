import { nodes as nodesRepo, type DB } from "@backbar/db";
import type { Bus } from "../bus";
import { applyReading, IngestError, type IngestInput } from "../ingest";
import type { MakeableCache } from "../makeable";
import {
  BirthPayload,
  ConfigPayload,
  parseTopic,
  ReadingPayload,
  topicFor,
  TOPIC_PATTERNS,
  type ParsedTopic,
} from "./topics";

export interface MqttDeps {
  db: DB;
  bus: Bus;
  makeable: MakeableCache;
}

/**
 * Minimal client surface — mirrors `mqtt`'s API but narrow enough that tests
 * inject a fake. The real client (MQTT.js) satisfies this without changes.
 */
export interface MqttClientLike {
  publish(
    topic: string,
    payload: string,
    opts?: { retain?: boolean; qos?: 0 | 1 | 2 },
  ): void;
  subscribe(topic: string | string[], cb?: (err?: Error | null) => void): void;
  on(event: "connect", cb: () => void): this;
  on(event: "message", cb: (topic: string, payload: Buffer) => void): this;
  on(event: "error", cb: (err: Error) => void): this;
  end(force?: boolean, cb?: () => void): void;
}

/**
 * Transport-agnostic message dispatch — exported so unit tests exercise the
 * exact path the broker callback runs without spinning up MQTT.
 *
 * Per spec §4 + api.md §3:
 *   - reading → applyReading() via the shared ingest core
 *   - birth   → node.status='online' + last_seen + (optional) fw_version
 *   - lwt     → node.status='offline'
 *
 * Each event is broadcast on the bus so the operator UI's `node.status` row
 * and the webhook adapter both react. Unparseable payloads are logged and
 * dropped — a malformed packet never takes the subscriber down.
 */
export function handleMqttMessage(
  deps: MqttDeps,
  topic: string,
  payload: string | Buffer,
): void {
  const parsed = parseTopic(topic);
  if (!parsed) return;

  const text = typeof payload === "string" ? payload : payload.toString("utf-8");
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      console.warn(`[mqtt] non-JSON payload on ${topic}: ${text.slice(0, 80)}`);
      return;
    }
  }

  switch (parsed.kind) {
    case "reading":
      return dispatchReading(deps, parsed, body);
    case "birth":
      return dispatchBirth(deps, parsed, body);
    case "lwt":
      return dispatchLwt(deps, parsed);
    case "config":
      // Config is server→node; if we receive it back it's a loopback. Ignore.
      return;
  }
}

function dispatchReading(deps: MqttDeps, topic: ParsedTopic, body: unknown): void {
  const parsed = ReadingPayload.safeParse(body);
  if (!parsed.success) {
    console.warn(`[mqtt] invalid reading payload from ${topic.device_id}`);
    return;
  }
  const input: IngestInput = {
    kind: "weight",
    device_id: topic.device_id,
    channel: parsed.data.channel,
    raw_g: parsed.data.raw_g,
    ts: parsed.data.ts ?? Date.now(),
  };
  try {
    applyReading(deps, input);
  } catch (err) {
    if (err instanceof IngestError) {
      // Unmapped channel is the loud case; log + drop so the broker keeps flowing.
      console.warn(`[mqtt] ingest skipped (${err.code}): ${err.message}`);
      return;
    }
    throw err;
  }
}

function dispatchBirth(deps: MqttDeps, topic: ParsedTopic, body: unknown): void {
  const parsed = BirthPayload.safeParse(body ?? {});
  if (!parsed.success) {
    console.warn(`[mqtt] invalid birth payload from ${topic.device_id}`);
    return;
  }
  const ts = Date.now();
  const existing = nodesRepo(deps.db).list().find((n) => n.device_id === topic.device_id);
  nodesRepo(deps.db).upsert({
    device_id: topic.device_id,
    label: parsed.data.label ?? existing?.label ?? null,
    last_seen: ts,
    status: "online",
    fw_version: parsed.data.fw_version ?? existing?.fw_version ?? null,
  });
  deps.bus.emit({
    type: "node.status",
    device_id: topic.device_id,
    status: "online",
    last_seen: ts,
  });
}

function dispatchLwt(deps: MqttDeps, topic: ParsedTopic): void {
  const ts = Date.now();
  const existing = nodesRepo(deps.db).list().find((n) => n.device_id === topic.device_id);
  nodesRepo(deps.db).upsert({
    device_id: topic.device_id,
    label: existing?.label ?? null,
    last_seen: existing?.last_seen ?? null,
    status: "offline",
    fw_version: existing?.fw_version ?? null,
  });
  deps.bus.emit({
    type: "node.status",
    device_id: topic.device_id,
    status: "offline",
    last_seen: existing?.last_seen ?? ts,
  });
}

export interface SubscriberHandle {
  client: MqttClientLike;
  pushConfig(device_id: string, payload: ConfigPayload): void;
  stop(): void;
}

/**
 * Attach the dispatcher to a connected MQTT client. The client is owned by
 * the caller (main.ts opens it, this just subscribes + wires the message
 * callback). Returns a handle with a `pushConfig` helper for calibration
 * push and a `stop` that ends the client cleanly.
 */
export function attachSubscriber(deps: MqttDeps, client: MqttClientLike): SubscriberHandle {
  client.on("connect", () => {
    client.subscribe(
      [TOPIC_PATTERNS.reading, TOPIC_PATTERNS.birth, TOPIC_PATTERNS.lwt],
      (err) => {
        if (err) console.warn("[mqtt] subscribe failed", err);
      },
    );
  });

  client.on("message", (topic, payload) => {
    try {
      handleMqttMessage(deps, topic, payload);
    } catch (err) {
      console.error(`[mqtt] handler threw on ${topic}`, err);
    }
  });

  client.on("error", (err) => {
    console.warn("[mqtt] client error", err.message);
  });

  return {
    client,
    pushConfig(device_id, payload) {
      const parsed = ConfigPayload.parse(payload);
      client.publish(topicFor(device_id, "config"), JSON.stringify(parsed), {
        retain: true,
        qos: 1,
      });
    },
    stop() {
      try {
        client.end();
      } catch {
        // ignore — already disconnected
      }
    },
  };
}
