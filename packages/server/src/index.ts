// @backbar/server — Hono API + WebSocket /live + transport-agnostic ingest core.
// See specs/api.md and the task-004 README for the surface.

export { buildApp, type App } from "./app";
export { buildDeps, type Deps } from "./deps";
export { Bus, type LiveEvent, type Listener } from "./bus";
export { serve } from "./serve";
export {
  applyReading,
  IngestError,
  type IngestInput,
  type IngestResult,
} from "./ingest";
export { MakeableCache, loadInventory, type MakeableItem } from "./makeable";
export {
  LOW_STOCK_FLOOR_ML,
  LOW_STOCK_FRACTION,
  STANDARD_POUR_ML,
  isLowStock,
  lowStockThreshold,
} from "./lowstock";
export { HMAC_HEADER, signBody, verifySignature } from "./hmac";
export {
  attachWebhook,
  fromEnv as webhookFromEnv,
  WebhookCfg,
} from "./webhook";
export { GeneratedSpec, IdeateRequest, PhotoImportRequest } from "./ai/schema";
export { buildGuestMenu } from "./routes/menu";
