import type { Context } from "hono";
import { ZodError, type z } from "zod";

/** `{error, detail?}` per spec api.md §conventions. */
export function err(c: Context, status: ContentfulStatusCode, error: string, detail?: unknown) {
  return c.json({ error, ...(detail !== undefined ? { detail } : {}) }, status);
}

type ContentfulStatusCode = 400 | 401 | 403 | 404 | 409 | 422 | 500 | 502 | 503;

/**
 * Parse the JSON request body through Zod, returning either the parsed value
 * or a `400 validation` response. Use as:
 *
 *   const parsed = await parseBody(c, MyZod);
 *   if (parsed.error) return parsed.response;
 *   // ... use parsed.data
 */
export async function parseBody<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
): Promise<{ data: z.infer<T>; error?: undefined } | { error: true; response: Response }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { error: true, response: err(c, 400, "validation", "invalid JSON body") };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return { error: true, response: err(c, 400, "validation", result.error.issues) };
  }
  return { data: result.data };
}

export function isZodError(e: unknown): e is ZodError {
  return e instanceof ZodError;
}
