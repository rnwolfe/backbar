import { migrate, openMemory, products, bottles, recipes, sensorChannels } from "@backbar/db";
import { buildApp } from "../src/app";
import { buildDeps, type Deps } from "../src/deps";

/** Stand up a test server backed by an in-memory SQLite DB seeded with two
 *  bottles + a Daiquiri-shaped recipe that's makeable from them. */
export function setup(env: NodeJS.ProcessEnv = {}) {
  const db = openMemory();
  migrate(db);
  products(db).insert({ id: "rum", name: "Generic Rum", category: "rum", flavor_tags: [], abv: 0.4 });
  products(db).insert({ id: "lime", name: "Lime Juice", category: "citrus", flavor_tags: [] });
  products(db).insert({ id: "simple", name: "Simple Syrup", category: "syrup-simple", flavor_tags: [] });

  bottles(db).insert({
    id: "b-rum",
    product_id: "rum",
    full_ml: 750,
    level_ml: 700,
    status: "open",
    tracked: true,
    tare_g: 500,
  });
  bottles(db).insert({
    id: "b-lime",
    product_id: "lime",
    full_ml: 500,
    level_ml: 400,
    status: "open",
    tracked: false,
  });
  bottles(db).insert({
    id: "b-simple",
    product_id: "simple",
    full_ml: 500,
    level_ml: 300,
    status: "open",
    tracked: false,
  });

  recipes(db).insert({
    id: "daiquiri",
    name: "Daiquiri",
    family: "sour",
    method: "shake",
    is_published: true,
    tags: [],
    ingredients: [
      { ref_type: "category", ref_id: "rum", amount: 60, unit: "ml", optional: false, garnish: false, sort: 0 },
      { ref_type: "category", ref_id: "citrus", amount: 22, unit: "ml", optional: false, garnish: false, sort: 1 },
      { ref_type: "category", ref_id: "syrup-simple", amount: 15, unit: "ml", optional: false, garnish: false, sort: 2 },
    ],
  });

  // Wire a calibrated channel so weight ingest has a target.
  sensorChannels(db).upsert({
    device_id: "dev-1",
    channel: 0,
    slot: "shelf-a-1",
    bottle_id: "b-rum",
    cal_slope: 1,
    cal_offset: 0,
  });

  const deps = buildDeps(db, env);
  const app = buildApp(deps);
  return { db, deps, app };
}

export async function call(app: ReturnType<typeof buildApp>, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const init: RequestInit = { method, headers: { "content-type": "application/json", ...headers } };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  return app.fetch(new Request(`http://test${path}`, init));
}

export async function eventsFrom(deps: Deps, fn: () => Promise<void> | void) {
  const events: Parameters<Parameters<Deps["bus"]["on"]>[0]>[0][] = [];
  const off = deps.bus.on((e) => events.push(e));
  try {
    await fn();
  } finally {
    off();
  }
  return events;
}
