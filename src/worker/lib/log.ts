/**
 * Logging terstruktur ringan untuk Cloudflare Workers.
 *
 * Output JSON satu baris ke `console.*` agar:
 *   - Mudah di-tail via `wrangler tail` dan filterable di Logpush.
 *   - Tidak menambah dependency.
 *   - Konsisten antar route, sehingga incident response lebih cepat.
 *
 * Tidak boleh melempar exception. Tidak boleh memperlambat hot path. Semua
 * field opsional dan akan di-skip kalau undefined.
 *
 * Aturan: jangan log nilai sensitif. Field `meta` sebaiknya berisi ID atau
 * counter, bukan password / token / payload kartu.
 */

import type { Context } from "hono";
import type { AppContext } from "../env";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  /** Pesan ringkas untuk manusia. Wajib. */
  msg: string;
  /** Kunci kategori, mis. "auth.login.failed". Opsional. */
  event?: string;
  /** Object metadata yang aman dilog. */
  meta?: Record<string, unknown>;
  /** Error native; akan di-serialize ke nama + message + stack pendek. */
  err?: unknown;
}

interface RequestContextFields {
  requestId?: string;
  userId?: string;
  adminId?: string;
  ip?: string;
  path?: string;
  method?: string;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (!err) return {};
  if (err instanceof Error) {
    return {
      err_name: err.name,
      err_message: err.message,
      // Stack di-trim supaya tidak meledakkan size log.
      err_stack: typeof err.stack === "string" ? err.stack.split("\n").slice(0, 6).join("\n") : undefined,
    };
  }
  return { err_message: String(err) };
}

function emit(level: LogLevel, ctxFields: RequestContextFields, fields: LogFields) {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg: fields.msg,
  };
  if (fields.event) payload.event = fields.event;
  if (ctxFields.requestId) payload.request_id = ctxFields.requestId;
  if (ctxFields.userId) payload.user_id = ctxFields.userId;
  if (ctxFields.adminId) payload.admin_id = ctxFields.adminId;
  if (ctxFields.ip) payload.ip = ctxFields.ip;
  if (ctxFields.path) payload.path = ctxFields.path;
  if (ctxFields.method) payload.method = ctxFields.method;
  if (fields.meta) Object.assign(payload, fields.meta);
  if (fields.err) Object.assign(payload, serializeError(fields.err));

  const line = JSON.stringify(payload);
  const fn =
    level === "error" ? console.error : level === "warn" ? console.warn : level === "debug" ? console.debug : console.log;
  // eslint-disable-next-line no-console
  fn(line);
}

/** Logger yang sudah di-bind ke konteks request. */
export interface Logger {
  debug(fields: LogFields): void;
  info(fields: LogFields): void;
  warn(fields: LogFields): void;
  error(fields: LogFields): void;
}

export function loggerFor(c: Context<AppContext>): Logger {
  const url = new URL(c.req.url);
  const ctxFields: RequestContextFields = {
    requestId: c.get("requestId"),
    userId: c.get("user")?.id,
    adminId: c.get("admin")?.id,
    ip: c.get("ip"),
    path: url.pathname,
    method: c.req.method,
  };
  return {
    debug: (f) => emit("debug", ctxFields, f),
    info: (f) => emit("info", ctxFields, f),
    warn: (f) => emit("warn", ctxFields, f),
    error: (f) => emit("error", ctxFields, f),
  };
}

/** Logger global untuk konteks non-request (cron, init). */
export const log: Logger = {
  debug: (f) => emit("debug", {}, f),
  info: (f) => emit("info", {}, f),
  warn: (f) => emit("warn", {}, f),
  error: (f) => emit("error", {}, f),
};
