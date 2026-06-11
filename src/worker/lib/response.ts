import type { Context } from "hono";
import type { ApiError, ApiSuccess } from "../../shared/types";

export function ok<T>(c: Context, data: T, status = 200) {
  return c.json<ApiSuccess<T>>({ ok: true, data }, status as any);
}

export function fail(
  c: Context,
  code: string,
  message: string,
  status = 400,
  details?: unknown,
) {
  const body: ApiError = { ok: false, error: { code, message, details } };
  return c.json(body, status as any);
}
