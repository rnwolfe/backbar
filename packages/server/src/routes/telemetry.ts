import { Hono } from "hono";
import {
  bottles as bottlesRepo,
  nodes as nodesRepo,
  pours as poursRepo,
  sensorChannels as channelsRepo,
} from "@backbar/db";
import type { Deps } from "../deps";
import { isLowStock } from "../lowstock";

/**
 * System telemetry — the numbers the Bottles right-rail and Shelf header
 * read off in one shot. All values are best-effort, computed off SQLite
 * counts so they're cheap to call.
 */
export function telemetryRouter(deps: Deps) {
  const r = new Hono();

  r.get("/", (c) => {
    const now = Date.now();
    const oneHourAgo = now - 3600 * 1000;
    const dayMs = 86_400_000;
    const startOfToday = startOfDay(now);

    const readingsLastHour = deps.db
      .query<{ c: number }, [number]>("SELECT COUNT(*) AS c FROM reading WHERE ts >= ?")
      .get(oneHourAgo)!.c;

    const allPours = poursRepo(deps.db).list(2000);
    const poursToday = allPours.filter((p) => p.made_at >= startOfToday).length;
    const lastPourAt = allPours[0]?.made_at ?? null;

    const allBottles = bottlesRepo(deps.db).list();
    const lowCount = allBottles.filter((b) => isLowStock(b)).length;
    const totalMl = allBottles.reduce((s, b) => s + b.level_ml, 0);

    const allNodes = nodesRepo(deps.db).list();
    const onlineNodes = allNodes.filter((n) => n.status === "online").length;

    const allChannels = channelsRepo(deps.db).list();
    const occupiedChannels = allChannels.filter((ch) => ch.bottle_id !== null).length;

    // Uptime — earliest reading across the bar. Approximates "how long has
    // the broker been ingesting data" without persisting a separate counter.
    const firstReadingTs = deps.db
      .query<{ ts: number | null }, []>("SELECT MIN(ts) AS ts FROM reading")
      .get()?.ts;
    const uptimeMs = firstReadingTs ? now - firstReadingTs : null;

    return c.json({
      now,
      readings_per_hour: readingsLastHour,
      pours_today: poursToday,
      last_pour_at: lastPourAt,
      last_pour_age_s: lastPourAt ? Math.round((now - lastPourAt) / 1000) : null,
      bottles_total: allBottles.length,
      bottles_low: lowCount,
      total_ml_on_hand: Math.round(totalMl),
      nodes_total: allNodes.length,
      nodes_online: onlineNodes,
      channels_total: allChannels.length,
      channels_occupied: occupiedChannels,
      uptime_ms: uptimeMs,
      uptime_days: uptimeMs ? Math.round((uptimeMs / dayMs) * 10) / 10 : null,
    });
  });

  return r;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
