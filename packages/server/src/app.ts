import { Hono } from "hono";
import type { Deps } from "./deps";
import { adminRouter } from "./routes/admin";
import { aiRouter, recipesPhotoImportRouter } from "./routes/ai";
import { bottlesRouter } from "./routes/bottles";
import { categoriesRouter } from "./routes/categories";
import { ingestRouter } from "./routes/ingest";
import { makeableRouter } from "./routes/makeable";
import { menuRouter } from "./routes/menu";
import { nodesRouter } from "./routes/nodes";
import { pourRouter } from "./routes/pour";
import { poursRouter } from "./routes/pours";
import { productsRouter } from "./routes/products";
import { readingsRouter } from "./routes/readings";
import { recipesRouter } from "./routes/recipes";
import { shoppingRouter } from "./routes/shopping";
import { telemetryRouter } from "./routes/telemetry";

/**
 * Build the Hono app from injected deps. The function-of-deps shape lets
 * tests stand up the API against an in-memory DB without globals.
 *
 * The WebSocket `/live` upgrade isn't on the Hono app — Bun's `serve()`
 * handles WS at the request level; see `main.ts` / `serve.ts`.
 */
export function buildApp(deps: Deps) {
  const app = new Hono();

  app.get("/", (c) => c.json({ ok: true, service: "backbar/server" }));
  app.get("/healthz", (c) => c.json({ ok: true }));

  app.route("/categories", categoriesRouter(deps));
  app.route("/products", productsRouter(deps));
  app.route("/bottles", bottlesRouter(deps));

  // /recipes lists CRUD and also nests /import-photo + /:id/confirm.
  const recipes = recipesRouter(deps);
  const hasGateway = !!process.env.AI_GATEWAY_API_KEY;
  recipes.route("/", recipesPhotoImportRouter(deps, { hasGateway }));
  app.route("/recipes", recipes);

  app.route("/ingest", ingestRouter(deps));
  app.route("/readings", readingsRouter(deps));
  app.route("/makeable", makeableRouter(deps));
  app.route("/nodes", nodesRouter(deps));
  app.route("/pour", pourRouter(deps));
  app.route("/pours", poursRouter(deps));
  app.route("/shopping-list", shoppingRouter(deps));
  app.route("/telemetry", telemetryRouter(deps));
  app.route("/ai", aiRouter(deps, { hasGateway }));
  app.route("/admin", adminRouter(deps));
  app.route("/guest", menuRouter(deps)); // exposes /guest/menu + /guest/menu/publish

  // Operators call /menu/publish (no /guest prefix) per spec api.md §1.
  app.route("/", menuRouter(deps));

  app.notFound((c) => c.json({ error: "not-found" }, 404));
  app.onError((err, c) => {
    console.error("[hono] unhandled", err);
    return c.json({ error: "internal", detail: err.message }, 500);
  });

  return app;
}

export type App = ReturnType<typeof buildApp>;
