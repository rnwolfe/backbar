import { Hono } from "hono";
import { nodes as nodesRepo } from "@backbar/db";
import type { Deps } from "../deps";

export function nodesRouter(deps: Deps) {
  const r = new Hono();
  r.get("/", (c) => c.json(nodesRepo(deps.db).list()));
  return r;
}
