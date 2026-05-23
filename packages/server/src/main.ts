#!/usr/bin/env bun
/**
 * Production-ish entry point. `bun run dev` invokes this with --hot.
 * Stays thin — open DB, migrate, wire deps, attach webhook, serve.
 */
import { migrate, open } from "@backbar/db";
import { buildApp } from "./app";
import { buildDeps } from "./deps";
import { serve } from "./serve";
import { attachWebhook, fromEnv as webhookFromEnv } from "./webhook";

const db = open();
migrate(db);

const deps = buildDeps(db);
const app = buildApp(deps);

const webhook = webhookFromEnv();
if (webhook) attachWebhook(deps.bus, db, webhook);

const server = serve(app, deps);
console.log(`[server] listening on http://localhost:${server.port}`);
console.log(`[server] webhook: ${webhook ? webhook.url : "disabled"}`);
console.log(`[server] ai: ${process.env.AI_GATEWAY_API_KEY ? "enabled" : "disabled"}`);
