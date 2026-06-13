import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { fail, ok } from "../lib/response";
import { hashPassword, verifyPassword } from "../lib/hash";
import { nanoId } from "../lib/id";
import { now } from "../lib/time";
import { createSession, destroySession } from "../lib/session";
import {
  clearUserSessionCookie,
  setUserSessionCookie,
} from "../lib/cookies";
import { rateLimit } from "../lib/rate-limit";
import { audit } from "../lib/audit";
import {
  validateUsername,
  validateEmail,
  validatePassword,
  validateDisplayName,
} from "../../shared/constants";

const app = new Hono<AppContext>({ strict: false });

const RegisterBody = z.object({
  username: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(120),
  password: z.string().min(1).max(200),
  displayName: z.string().trim().max(120).optional(),
});

app.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = RegisterBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Data registrasi tidak valid.", 400, parsed.error.flatten());

  // Validasi aturan akun (sumber kebenaran). Pesan spesifik dikembalikan apa
  // adanya agar user tahu persis bagian mana yang salah.
  const usernameErr = validateUsername(parsed.data.username);
  if (usernameErr) return fail(c, "validation", usernameErr, 400);
  const emailErr = validateEmail(parsed.data.email);
  if (emailErr) return fail(c, "validation", emailErr, 400);
  const passwordErr = validatePassword(parsed.data.password);
  if (passwordErr) return fail(c, "validation", passwordErr, 400);
  if (parsed.data.displayName) {
    const dnErr = validateDisplayName(parsed.data.displayName);
    if (dnErr) return fail(c, "validation", dnErr, 400);
  }

  const ts = now();
  const ip = c.get("ip");
  const rl = await rateLimit(c.env, { key: `rl:register:${ip}`, windowSeconds: 60, max: 5 });
  if (!rl.allowed) return fail(c, "rate_limited", "Terlalu sering. Coba beberapa saat lagi.", 429);

  const exists = await c.env.DB.prepare(
    "SELECT id FROM users WHERE username = ? OR email = ?",
  )
    .bind(parsed.data.username.toLowerCase(), parsed.data.email.toLowerCase())
    .first<{ id: string }>();
  if (exists) return fail(c, "duplicate", "Username atau email sudah dipakai.", 409);

  const { hash, salt } = await hashPassword(parsed.data.password);
  const id = nanoId("usr");
  await c.env.DB.prepare(
    `INSERT INTO users (id, username, email, password_hash, password_salt, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      parsed.data.username.toLowerCase(),
      parsed.data.email.toLowerCase(),
      hash,
      salt,
      parsed.data.displayName ?? null,
      ts,
      ts,
    )
    .run();

  // Buat keranjang awal
  await c.env.DB.prepare("INSERT INTO carts (id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .bind(nanoId("crt"), id, ts, ts)
    .run();

  await audit(c.env, {
    actorKind: "user",
    actorId: id,
    action: "user.registered",
    ip: c.get("ip"),
    userAgent: c.get("userAgent"),
  });

  return ok(c, { ok: true });
});

const LoginBody = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(120),
});

app.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = LoginBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Username dan password wajib diisi.", 400);

  const ip = c.get("ip");
  const rlIp = await rateLimit(c.env, { key: `rl:login:ip:${ip}`, windowSeconds: 60, max: 10 });
  if (!rlIp.allowed) return fail(c, "rate_limited", "Terlalu banyak percobaan. Coba lagi nanti.", 429);
  const rlUser = await rateLimit(c.env, {
    key: `rl:login:user:${parsed.data.username.toLowerCase()}`,
    windowSeconds: 300,
    max: 8,
  });
  if (!rlUser.allowed) return fail(c, "rate_limited", "Akun ini dikunci sementara. Coba lagi nanti.", 429);

  const u = await c.env.DB.prepare(
    `SELECT id, username, email, password_hash, password_salt, status, status_reason, balance_cents, session_version
       FROM users WHERE username = ? OR email = ?`,
  )
    .bind(parsed.data.username.toLowerCase(), parsed.data.username.toLowerCase())
    .first<{
      id: string;
      username: string;
      email: string;
      password_hash: string;
      password_salt: string;
      status: string;
      status_reason: string | null;
      balance_cents: number;
      session_version: number;
    }>();
  if (!u) return fail(c, "invalid_credentials", "Username atau password salah.", 401);

  if (u.status !== "active") {
    // Pesan generik agar tidak membocorkan detail moderasi internal kepada
    // pihak yang hanya mencoba menebak akun. status_reason sengaja tidak
    // dipancarkan ke client.
    return fail(c, "account_disabled", "Akun kamu tidak aktif.", 403);
  }

  const okPwd = await verifyPassword(parsed.data.password, u.password_salt, u.password_hash);
  if (!okPwd) return fail(c, "invalid_credentials", "Username atau password salah.", 401);

  // Naikkan session_version supaya semua sesi lama lain di-invalidate (login dari device baru)
  const ts = now();
  await c.env.DB.prepare("UPDATE users SET session_version = session_version + 1, updated_at = ? WHERE id = ?")
    .bind(ts, u.id)
    .run();
  const newVerRow = await c.env.DB.prepare("SELECT session_version FROM users WHERE id = ?")
    .bind(u.id)
    .first<{ session_version: number }>();

  const ttl = parseInt(c.env.SESSION_TTL_SECONDS, 10) || 3600;
  const created = await createSession(c.env, "user", u.id, newVerRow?.session_version ?? u.session_version, ttl, {
    ip: c.get("ip"),
    userAgent: c.get("userAgent"),
  });
  setUserSessionCookie(c, created.token, ttl);

  await audit(c.env, {
    actorKind: "user",
    actorId: u.id,
    action: "user.login",
    ip: c.get("ip"),
    userAgent: c.get("userAgent"),
  });

  return ok(c, {
    user: {
      id: u.id,
      username: u.username,
      email: u.email,
      balanceCents: u.balance_cents,
    },
  });
});

app.post("/logout", async (c) => {
  const user = c.get("user");
  if (user) {
    await destroySession(c.env, "user", user.sessionId);
    await audit(c.env, { actorKind: "user", actorId: user.id, action: "user.logout" });
  }
  clearUserSessionCookie(c);
  return ok(c, { ok: true });
});

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});

app.post("/change-password", async (c) => {
  const user = c.get("user");
  if (!user) return fail(c, "unauthenticated", "Silakan login dulu.", 401);
  const body = await c.req.json().catch(() => null);
  const parsed = ChangePasswordBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Password tidak valid.", 400);

  // Password baru wajib memenuhi policy yang sama dengan registrasi.
  const pErr = validatePassword(parsed.data.newPassword);
  if (pErr) return fail(c, "validation", pErr, 400);

  const u = await c.env.DB.prepare(
    "SELECT password_hash, password_salt FROM users WHERE id = ?",
  )
    .bind(user.id)
    .first<{ password_hash: string; password_salt: string }>();
  if (!u) return fail(c, "not_found", "User tidak ditemukan.", 404);

  const okPwd = await verifyPassword(parsed.data.currentPassword, u.password_salt, u.password_hash);
  if (!okPwd) return fail(c, "invalid_credentials", "Password lama salah.", 401);

  const { hash, salt } = await hashPassword(parsed.data.newPassword);
  const ts = now();
  await c.env.DB.prepare(
    "UPDATE users SET password_hash = ?, password_salt = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?",
  )
    .bind(hash, salt, ts, user.id)
    .run();

  // Invalidasi sesi sekarang juga.
  await destroySession(c.env, "user", user.sessionId);
  clearUserSessionCookie(c);
  await audit(c.env, { actorKind: "user", actorId: user.id, action: "user.password.changed" });

  return ok(c, { ok: true });
});

export default app;
