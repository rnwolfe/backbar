import mqtt, { type IClientOptions } from "mqtt";
import { attachSubscriber, type MqttClientLike, type MqttDeps, type SubscriberHandle } from "./subscriber";

export interface StartMqttOptions {
  url: string;
  /** Extra options passed straight to mqtt.connect — auth, certs, clientId. */
  clientOptions?: IClientOptions;
}

/**
 * Open a connection to the local broker and attach the subscriber. The
 * concrete `mqtt` package is imported only here so unit tests in
 * `mqtt.test.ts` can exercise `attachSubscriber` against a fake client
 * without a broker on the test box.
 *
 * Spec §4 / api.md §3: broker = local Mosquitto, topics = backbar/+/...,
 * config push goes back the other way via `handle.pushConfig`.
 */
export function startMqtt(deps: MqttDeps, opts: StartMqttOptions): SubscriberHandle {
  const client = mqtt.connect(opts.url, {
    reconnectPeriod: 5000,
    ...opts.clientOptions,
  });
  return attachSubscriber(deps, client as unknown as MqttClientLike);
}
