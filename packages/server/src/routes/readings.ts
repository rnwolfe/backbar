import { Hono } from "hono";
import { z } from "zod";
import { bottles as bottlesRepo, readings as readingsRepo } from "@backbar/db";
import type { Deps } from "../deps";
import { err } from "../errors";

const LimitQ = z.coerce.number().int().positive().max(1000).optional();

export function readingsRouter(deps: Deps) {
  const r = new Hono();

  r.get("/:bottleId", (c) => {
    const bottleId = c.req.param("bottleId");
    if (!bottlesRepo(deps.db).get(bottleId)) {
      return err(c, 404, "not-found", `bottle '${bottleId}'`);
    }
    const limitParsed = LimitQ.safeParse(c.req.query("limit"));
    if (!limitParsed.success) return err(c, 400, "validation", limitParsed.error.issues);
    return c.json(readingsRepo(deps.db).forBottle(bottleId, limitParsed.data ?? 100));
  });

  return r;
}
