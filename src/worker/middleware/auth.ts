import type { MiddlewareHandler } from "hono";
import type { AppContext } from "../env";
import { readAdminSessionCookie, readUserSessionCookie } from "../lib/cookies";
import { loadSession } from "../lib/session";
import { fail } from "../lib/response";

export const attachAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  c.set("user", null);
  c.set("admin", null);

  const userToken = readUserSessionCookie(c);
  if (userToken) {
    const result = await loadSession(c.env, userToken);
    if (result && result.payload.k === "user") {
      // Verifikasi version + status user
      const row = await c.env.DB.prepare(
        "SELECT id, username, email, status, balance_cents, session_version FROM users WHERE id = ?",
      )
        .bind(result.payload.uid)
        .first<{
          id: string;
          username: string;
          email: string;
          status: string;
          balance_cents: number;
          session_version: number;
        }>();
      if (row && row.status === "active" && row.session_version === result.payload.v) {
        c.set("user", {
          id: row.id,
          username: row.username,
          email: row.email,
          balanceCents: row.balance_cents,
          sessionId: result.payload.sid,
          sessionVersion: row.session_version,
        });
      }
    }
  }

  const adminToken = readAdminSessionCookie(c);
  if (adminToken) {
    const result = await loadSession(c.env, adminToken);
    if (result && result.payload.k === "admin") {
      const row = await c.env.DB.prepare(
        "SELECT id, username, session_version FROM admins WHERE id = ?",
      )
        .bind(result.payload.uid)
        .first<{ id: string; username: string; session_version: number }>();
      if (row && row.session_version === result.payload.v) {
        c.set("admin", {
          id: row.id,
          username: row.username,
          sessionId: result.payload.sid,
        });
      }
    }
  }

  await next();
};

export const requireUser: MiddlewareHandler<AppContext> = async (c, next) => {
  if (!c.get("user")) return fail(c, "unauthenticated", "Silakan login dulu untuk lanjut.", 401);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppContext> = async (c, next) => {
  if (!c.get("admin")) return fail(c, "unauthenticated_admin", "Sesi admin tidak valid.", 401);
  await next();
};
