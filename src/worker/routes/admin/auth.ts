import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/response";
import { hashPassword, verifyPassword } from "../../lib/hash";
import { now } from "../../lib/time";
import { rateLimit } from "../../lib/rate-limit";
import { nanoId } from "../../lib/id";
import { sendTelegram } from "../../services/telegram";
import { createSession, destroySession } from "../../lib/session";
import { clearAdminSessionCookie, setAdminSessionCookie } from "../../lib/cookies";
import { audit } from "../../lib/audit";
import { loggerFor } from "../../lib/log";

const app = new Hono<AppContext>({ strict: false });

interface AdminRow {
  id: string;
  username: string;
  password_hash: string;
  password_salt: string;
  session_version: number;
}

async function ensureSeedAdmin(env: AppContext["Bindings"]) {
  // Bila tabel admins kosong, seed dari env (ADMIN_USERNAME + ADMIN_PASSWORD_HASH OR plain).
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM admins").first<{ c: number }>();
  if (row && row.c > 0) return;
  if (!env.ADMIN_USERNAME) return;
  // Jika ADMIN_PASSWORD_HASH disuplai, treat sebagai plain password (akan dihash di sini).
  const password = env.ADMIN_PASSWORD_HASH || "admin";
  const { hash, salt } = await hashPassword(password);
  const ts = now();
  await env.DB.prepare(
    "INSERT INTO admins (id, username, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(nanoId("adm"), env.ADMIN_USERNAME, hash, salt, ts, ts)
    .run();
}

const StartLoginBody = z.object({
  username: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(120),
});

app.post("/start-login", async (c) => {
  await ensureSeedAdmin(c.env);
  const body = await c.req.json().catch(() => null);
  const parsed = StartLoginBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Username/password wajib diisi.");

  const ip = c.get("ip");
  const rl = await rateLimit(c.env, { key: `rl:admin_login:${ip}`, windowSeconds: 60, max: 8 });
  if (!rl.allowed) return fail(c, "rate_limited", "Terlalu banyak percobaan login admin.", 429);
  const rl2 = await rateLimit(c.env, {
    key: `rl:admin_login_user:${parsed.data.username}`,
    windowSeconds: 600,
    max: 6,
  });
  if (!rl2.allowed) return fail(c, "rate_limited", "Akun admin ini dikunci sementara.", 429);

  const a = await c.env.DB.prepare(
    "SELECT id, username, password_hash, password_salt, session_version FROM admins WHERE username = ?",
  )
    .bind(parsed.data.username)
    .first<AdminRow>();
  if (!a) return fail(c, "invalid_credentials", "Kredensial admin salah.", 401);
  const okPwd = await verifyPassword(parsed.data.password, a.password_salt, a.password_hash);
  if (!okPwd) return fail(c, "invalid_credentials", "Kredensial admin salah.", 401);

  // Generate OTP token + ticket
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const ticket = nanoId("tkt", 32);
  const ttl = parseInt(c.env.ADMIN_OTP_TTL_SECONDS, 10) || 300;
  await c.env.KV.put(
    `admin_otp:${ticket}`,
    JSON.stringify({ adminId: a.id, code, attempts: 0, resends: 1, lastSentAt: now() }),
    { expirationTtl: ttl },
  );

  // Kirim OTP via Telegram. Saat dev tanpa konfigurasi, log ke konsol supaya admin bisa testing.
  const tgMsg = `<b>Login admin</b>\nUsername: <code>${a.username}</code>\nIP: <code>${ip}</code>\nKode OTP: <b>${code}</b>\nBerlaku: ${ttl} detik.`;
  const sent = await sendTelegram(c.env, tgMsg);
  if (!sent.ok && c.env.APP_ENV !== "production") {
    loggerFor(c).warn({
      event: "admin.otp.dev_fallback",
      msg: "Telegram tidak terkonfigurasi, OTP ditampilkan di log untuk dev.",
      meta: { ticket, code },
    });
  }

  await audit(c.env, {
    actorKind: "admin",
    actorId: a.id,
    action: "admin.login.start",
    ip,
    userAgent: c.get("userAgent"),
    meta: { telegram_sent: sent.ok },
  });

  return ok(c, { ticket, telegramSent: sent.ok, telegramHint: sent.ok ? null : sent.description });
});

const VerifyBody = z.object({
  ticket: z.string().min(8),
  code: z.string().regex(/^\d{6}$/),
});

app.post("/verify-otp", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = VerifyBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Tiket atau kode tidak valid.");
  const ip = c.get("ip");
  const rl = await rateLimit(c.env, { key: `rl:admin_otp:${ip}`, windowSeconds: 60, max: 12 });
  if (!rl.allowed) return fail(c, "rate_limited", "Terlalu banyak percobaan OTP.", 429);

  const raw = await c.env.KV.get(`admin_otp:${parsed.data.ticket}`);
  if (!raw) return fail(c, "expired", "OTP sudah kedaluwarsa atau tidak valid.", 401);
  const obj = JSON.parse(raw) as {
    adminId: string;
    code: string;
    attempts: number;
    resends: number;
    lastSentAt: number;
  };
  obj.attempts += 1;
  if (obj.attempts > 6) {
    await c.env.KV.delete(`admin_otp:${parsed.data.ticket}`);
    return fail(c, "locked", "Terlalu banyak salah OTP.", 403);
  }
  if (obj.code !== parsed.data.code) {
    await c.env.KV.put(`admin_otp:${parsed.data.ticket}`, JSON.stringify(obj), {
      expirationTtl: parseInt(c.env.ADMIN_OTP_TTL_SECONDS, 10),
    });
    return fail(c, "wrong_code", "Kode OTP salah.", 401);
  }
  // OTP benar. Hapus dan buat session.
  await c.env.KV.delete(`admin_otp:${parsed.data.ticket}`);
  const a = await c.env.DB.prepare("SELECT id, username, session_version FROM admins WHERE id = ?")
    .bind(obj.adminId)
    .first<{ id: string; username: string; session_version: number }>();
  if (!a) return fail(c, "not_found", "Admin tidak ditemukan.", 404);
  await c.env.DB.prepare(
    "UPDATE admins SET session_version = session_version + 1, updated_at = ? WHERE id = ?",
  )
    .bind(now(), a.id)
    .run();
  const fresh = await c.env.DB.prepare("SELECT session_version FROM admins WHERE id = ?")
    .bind(a.id)
    .first<{ session_version: number }>();
  const ttl = parseInt(c.env.SESSION_TTL_SECONDS, 10) || 3600;
  const created = await createSession(c.env, "admin", a.id, fresh!.session_version, ttl, {
    ip,
    userAgent: c.get("userAgent"),
  });
  setAdminSessionCookie(c, created.token, ttl);

  await audit(c.env, {
    actorKind: "admin",
    actorId: a.id,
    action: "admin.login.success",
    ip,
    userAgent: c.get("userAgent"),
  });
  return ok(c, { admin: { id: a.id, username: a.username } });
});

const ResendBody = z.object({ ticket: z.string().min(8) });

app.post("/resend-otp", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ResendBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Tiket tidak valid.");
  const raw = await c.env.KV.get(`admin_otp:${parsed.data.ticket}`);
  if (!raw) return fail(c, "expired", "Sesi OTP sudah kedaluwarsa.", 401);
  const obj = JSON.parse(raw) as {
    adminId: string;
    code: string;
    attempts: number;
    resends: number;
    lastSentAt: number;
  };
  const cd = parseInt(c.env.ADMIN_OTP_RESEND_COOLDOWN, 10) || 120;
  const max = parseInt(c.env.ADMIN_OTP_MAX_RESENDS, 10) || 3;
  if (obj.resends >= max) return fail(c, "limit_reached", "Batas pengiriman ulang OTP tercapai.", 429);
  if (now() - obj.lastSentAt < cd) {
    return fail(c, "cooldown", `Tunggu ${cd - (now() - obj.lastSentAt)} detik untuk minta lagi.`, 429);
  }
  // Gunakan kode yang sama atau buat baru? Buat baru supaya kode lama tidak dipakai.
  obj.code = Math.floor(100000 + Math.random() * 900000).toString();
  obj.resends += 1;
  obj.lastSentAt = now();
  await c.env.KV.put(`admin_otp:${parsed.data.ticket}`, JSON.stringify(obj), {
    expirationTtl: parseInt(c.env.ADMIN_OTP_TTL_SECONDS, 10) || 300,
  });
  const a = await c.env.DB.prepare("SELECT username FROM admins WHERE id = ?").bind(obj.adminId).first<{
    username: string;
  }>();
  await sendTelegram(
    c.env,
    `<b>Resend OTP</b>\nUsername: <code>${a?.username}</code>\nKode OTP: <b>${obj.code}</b>`,
  );
  if (c.env.APP_ENV !== "production") {
    loggerFor(c).warn({
      event: "admin.otp.dev_fallback",
      msg: "Resend OTP dev fallback.",
      meta: { ticket: parsed.data.ticket, code: obj.code },
    });
  }
  return ok(c, { resends: obj.resends, max });
});

app.post("/logout", async (c) => {
  const admin = c.get("admin");
  if (admin) {
    await destroySession(c.env, "admin", admin.sessionId);
    await audit(c.env, { actorKind: "admin", actorId: admin.id, action: "admin.logout" });
  }
  clearAdminSessionCookie(c);
  return ok(c, { ok: true });
});

app.get("/me", async (c) => {
  const admin = c.get("admin");
  if (!admin) return fail(c, "unauthenticated_admin", "Sesi admin tidak valid.", 401);
  return ok(c, { admin });
});

const ConfirmPwdBody = z.object({ password: z.string().min(1).max(120) });
// Helper buat verifikasi password admin (dipanggil sebelum aksi sensitif).
app.post("/confirm-password", async (c) => {
  const admin = c.get("admin");
  if (!admin) return fail(c, "unauthenticated_admin", "Sesi admin tidak valid.", 401);
  // Brute-force protection bila sesi admin sempat bocor: maks 6 percobaan
  // password per menit per admin.
  const rl = await rateLimit(c.env, {
    key: `rl:admin_confirm:${admin.id}`,
    windowSeconds: 60,
    max: 6,
  });
  if (!rl.allowed)
    return fail(c, "rate_limited", "Terlalu banyak percobaan konfirmasi. Coba lagi sebentar.", 429);
  const body = await c.req.json().catch(() => null);
  const parsed = ConfirmPwdBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Password wajib.");
  const a = await c.env.DB.prepare("SELECT password_hash, password_salt FROM admins WHERE id = ?")
    .bind(admin.id)
    .first<{ password_hash: string; password_salt: string }>();
  if (!a) return fail(c, "not_found", "Admin tidak ditemukan.", 404);
  const okPwd = await verifyPassword(parsed.data.password, a.password_salt, a.password_hash);
  if (!okPwd) return fail(c, "invalid", "Password admin salah.", 401);
  // Simpan token ack di KV (5 menit) untuk dipakai endpoint sensitif.
  const token = nanoId("ack", 24);
  await c.env.KV.put(`admin_ack:${admin.id}:${token}`, "1", { expirationTtl: 300 });
  return ok(c, { ack: token });
});

export async function consumeAdminAck(env: AppContext["Bindings"], adminId: string, token: string): Promise<boolean> {
  const k = `admin_ack:${adminId}:${token}`;
  const v = await env.KV.get(k);
  if (!v) return false;
  await env.KV.delete(k);
  return true;
}

export default app;
