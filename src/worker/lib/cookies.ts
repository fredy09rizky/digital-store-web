import type { Context } from "hono";

const USER_COOKIE = "ds_session";
const ADMIN_COOKIE = "ds_admin_session";

function buildCookie(name: string, value: string, opts: { maxAge?: number; expires?: Date; clear?: boolean; secure?: boolean }): string {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (opts.secure ?? true) parts.push("Secure");
  if (opts.clear) {
    parts.push("Max-Age=0");
  } else if (typeof opts.maxAge === "number") {
    parts.push(`Max-Age=${opts.maxAge}`);
  }
  return parts.join("; ");
}

function isSecure(c: Context): boolean {
  // Trust APP_ENV. Cloudflare selalu HTTPS untuk Worker production.
  // Untuk dev (HTTP), cookie tanpa Secure agar bisa terkirim.
  return c.env.APP_ENV === "production";
}

export function setUserSessionCookie(c: Context, token: string, ttl: number) {
  c.header("Set-Cookie", buildCookie(USER_COOKIE, token, { maxAge: ttl, secure: isSecure(c) }), { append: true });
}
export function clearUserSessionCookie(c: Context) {
  c.header("Set-Cookie", buildCookie(USER_COOKIE, "", { clear: true, secure: isSecure(c) }), { append: true });
}
export function setAdminSessionCookie(c: Context, token: string, ttl: number) {
  c.header("Set-Cookie", buildCookie(ADMIN_COOKIE, token, { maxAge: ttl, secure: isSecure(c) }), { append: true });
}
export function clearAdminSessionCookie(c: Context) {
  c.header("Set-Cookie", buildCookie(ADMIN_COOKIE, "", { clear: true, secure: isSecure(c) }), { append: true });
}

export function readUserSessionCookie(c: Context): string | null {
  return readCookie(c, USER_COOKIE);
}
export function readAdminSessionCookie(c: Context): string | null {
  return readCookie(c, ADMIN_COOKIE);
}

function readCookie(c: Context, name: string): string | null {
  const raw = c.req.header("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || null;
  }
  return null;
}
