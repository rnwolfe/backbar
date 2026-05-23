#!/usr/bin/env bun
/**
 * Production-ish entry point. `bun run dev` invokes this with --hot.
 * Stays thin — open DB, migrate, wire deps, attach webhook, serve.
 */
import { migrate, open } from "@backbar/db";
import { bootstrapGatewayKey } from "./ai/gateway";
import { buildApp } from "./app";
import { buildDeps } from "./deps";
import { startMqtt } from "./mqtt";
import { serve } from "./serve";
import { attachWebhook, fromEnv as webhookFromEnv } from "./webhook";

// Bootstrap AI_GATEWAY_API_KEY from ~/.ai_gateway_api_key (spec §0/§3) before
// any code reads it — main.ts and app.ts both consult process.env afterwards.
bootstrapGatewayKey();

const db = open();
migrate(db);

const deps = buildDeps(db);

const webhook = webhookFromEnv();
if (webhook) attachWebhook(deps.bus, db, webhook);

// MQTT subscriber is the second adapter into applyReading() (spec §4).
// Stays off in P0/P1 — set MQTT_URL to enable once the broker is reachable.
const mqttUrl = process.env.MQTT_URL;
const mqtt = mqttUrl ? startMqtt(deps, { url: mqttUrl }) : null;
if (mqtt) deps.pushConfig = (id, payload) => mqtt.pushConfig(id, payload);

const app = buildApp(deps);

const server = serve(app, deps);
console.log(`[server] listening on http://localhost:${server.port}`);
console.log(`[server] webhook: ${webhook ? webhook.url : "disabled"}`);
console.log(`[server] mqtt: ${mqtt ? mqttUrl : "disabled"}`);
console.log(`[server] ai: ${process.env.AI_GATEWAY_API_KEY ? "enabled" : "disabled"}`);

if (mqtt) {
  process.on("SIGINT", () => mqtt.stop());
  process.on("SIGTERM", () => mqtt.stop());
}
