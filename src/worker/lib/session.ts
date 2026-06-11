// Token sesi sederhana berbasis HMAC-signed JSON kecil.
// Penyimpanan utama tetap di KV (sebagai single source of truth) supaya
// mudah di-revoke saat session_version user/admin naik.

import type { AppBindings } from "../env";
import { bytesToBase64Url, base64UrlToBytes, hmacSha256B64, timingSafeEqual } from "./hash";

export type SessionKind = "user" | "admin";

export interface SessionPayload {
  k: SessionKind;
  sid: string;
  uid: string;
  v: number; // session version saat dibuat
  iat: number;
  exp: number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function signSession(secret: string, payload: SessionPayload): Promise<string> {
  const json = JSON.stringify(payload);
  const body = bytesToBase64Url(enc.encode(json));
  const sig = await hmacSha256B64(secret, body);
  return `${body}.${sig}`;
}

export async function verifySession(secret: string, token: string): Promise<SessionPayload | null> {
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expectedSig = await hmacSha256B64(secret, body);
  if (!timingSafeEqual(sig, expectedSig)) return null;
  try {
    const json = dec.decode(base64UrlToBytes(body));
    const p = JSON.parse(json) as SessionPayload;
    if (typeof p.exp !== "number" || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

export function sessionKvKey(kind: SessionKind, sid: string): string {
  return `sess:${kind}:${sid}`;
}

export function activeUserSessionKey(uid: string): string {
  return `active_sess:user:${uid}`;
}
export function activeAdminSessionKey(uid: string): string {
  return `active_sess:admin:${uid}`;
}

export interface StoredSession {
  kind: SessionKind;
  sid: string;
  uid: string;
  version: number;
  ip?: string;
  userAgent?: string;
  createdAt: number;
  expiresAt: number;
}

export async function createSession(
  bindings: AppBindings,
  kind: SessionKind,
  uid: string,
  version: number,
  ttlSeconds: number,
  ctx: { ip?: string; userAgent?: string } = {},
): Promise<{ token: string; session: StoredSession }> {
  const sid = crypto.randomUUID().replace(/-/g, "");
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;
  const payload: SessionPayload = { k: kind, sid, uid, v: version, iat, exp };
  const token = await signSession(bindings.SESSION_SECRET, payload);

  const session: StoredSession = {
    kind,
    sid,
    uid,
    version,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    createdAt: iat,
    expiresAt: exp,
  };

  // Simpan token aktif di KV (TTL otomatis).
  await bindings.KV.put(sessionKvKey(kind, sid), JSON.stringify(session), {
    expirationTtl: ttlSeconds,
  });

  // Catat sesi aktif terbaru per user untuk auto-invalidate perangkat lain.
  const activeKey = kind === "user" ? activeUserSessionKey(uid) : activeAdminSessionKey(uid);
  await bindings.KV.put(activeKey, sid, { expirationTtl: ttlSeconds });

  return { token, session };
}

export async function loadSession(
  bindings: AppBindings,
  token: string,
): Promise<{ payload: SessionPayload; stored: StoredSession } | null> {
  const payload = await verifySession(bindings.SESSION_SECRET, token);
  if (!payload) return null;
  const raw = await bindings.KV.get(sessionKvKey(payload.k, payload.sid));
  if (!raw) return null;
  let stored: StoredSession;
  try {
    stored = JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
  // Pastikan sid masih sesi aktif terbaru untuk user ini.
  const activeKey =
    payload.k === "user" ? activeUserSessionKey(payload.uid) : activeAdminSessionKey(payload.uid);
  const activeSid = await bindings.KV.get(activeKey);
  if (activeSid && activeSid !== payload.sid) return null;
  return { payload, stored };
}

export async function destroySession(bindings: AppBindings, kind: SessionKind, sid: string) {
  await bindings.KV.delete(sessionKvKey(kind, sid));
}
