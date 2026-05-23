/**
 * MQTT adapter — second transport adapter into the ingest core (see
 * `packages/server/src/ingest.ts` for the core). One ingest core, two
 * adapters: HTTP `/ingest/reading` is the other.
 *
 * Topology + payload shape: `topics.ts`.
 * Dispatch + bus emission:  `subscriber.ts`.
 * Connect helper:           `connect.ts` (real `mqtt` client; optional).
 */
export {
  attachSubscriber,
  handleMqttMessage,
  type MqttClientLike,
  type MqttDeps,
  type SubscriberHandle,
} from "./subscriber";
export {
  BirthPayload,
  ConfigPayload,
  ReadingPayload,
  parseTopic,
  topicFor,
  TOPIC_PATTERNS,
  TOPIC_PREFIX,
  type ParsedTopic,
  type TopicKind,
} from "./topics";
export { startMqtt, type StartMqttOptions } from "./connect";
