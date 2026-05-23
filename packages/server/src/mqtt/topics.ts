import { z } from "zod";

/**
 * MQTT topic shape used by the fleet. The leading segment is fixed; per-node
 * topics are `backbar/<device_id>/<kind>`. Subscribers can use the `+`
 * wildcard for the device segment (`backbar/+/reading`).
 *
 * Topic names (spec api.md §3, backbar-architecture-spec.md §4):
 *   backbar/<device_id>/reading   node → server   (retained per channel)
 *   backbar/<device_id>/birth     node → server   { fw_version }
 *   backbar/<device_id>/lwt       LWT             {} (retained while offline)
 *   backbar/<device_id>/config    server → node   cadence + cal push
 */
export const TOPIC_PREFIX = "backbar";

export type TopicKind = "reading" | "birth" | "lwt" | "config";

export const TOPIC_PATTERNS = {
  reading: `${TOPIC_PREFIX}/+/reading`,
  birth: `${TOPIC_PREFIX}/+/birth`,
  lwt: `${TOPIC_PREFIX}/+/lwt`,
} as const;

export function topicFor(deviceId: string, kind: TopicKind): string {
  return `${TOPIC_PREFIX}/${deviceId}/${kind}`;
}

const TopicShape = z.tuple([
  z.literal(TOPIC_PREFIX),
  z.string().min(1),
  z.enum(["reading", "birth", "lwt", "config"]),
]);

export interface ParsedTopic {
  device_id: string;
  kind: TopicKind;
}

/** Parse a topic string → device_id + kind, or null if it doesn't match. */
export function parseTopic(topic: string): ParsedTopic | null {
  const parts = topic.split("/");
  const parsed = TopicShape.safeParse(parts);
  if (!parsed.success) return null;
  return { device_id: parsed.data[1], kind: parsed.data[2] };
}

/** Payload shape published by the node on `backbar/<device_id>/reading`. */
export const ReadingPayload = z.object({
  channel: z.number().int().nonnegative(),
  raw_g: z.number(),
  ts: z.number().int().optional(),
});
export type ReadingPayload = z.infer<typeof ReadingPayload>;

/** Birth payload — published once at boot, retained. */
export const BirthPayload = z.object({
  fw_version: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
});
export type BirthPayload = z.infer<typeof BirthPayload>;

/** Config push from server → node (sub topic). */
export const ConfigPayload = z.object({
  cadence_s: z.number().int().positive().optional(),
  cal: z
    .array(
      z.object({
        channel: z.number().int().nonnegative(),
        slope: z.number(),
        offset: z.number(),
      }),
    )
    .optional(),
});
export type ConfigPayload = z.infer<typeof ConfigPayload>;
