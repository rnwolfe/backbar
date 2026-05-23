import { Hono } from "hono";
import type { Deps } from "../deps";

export function makeableRouter(deps: Deps) {
  const r = new Hono();
  r.get("/", (c) => c.json(deps.makeable.list()));
  return r;
}
