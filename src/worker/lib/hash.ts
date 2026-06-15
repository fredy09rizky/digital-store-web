// Helper hashing & HMAC, semua memakai Web Crypto.

const enc = new TextEncoder();

export function bytesToHex(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < u8.length; i++) {
    out += u8[i].toString(16).padStart(2, "0");
  }
  return out;
}

export function bytesToBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(s: string): Uint8Array {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? enc.encode(input) : input;
  const buf = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(buf);
}

export async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return new Uint8Array(sig);
}

export async function hmacSha256B64(secret: string, message: string): Promise<string> {
  const sig = await hmacSha256(secret, message);
  return bytesToBase64Url(sig);
}

// Konstan-time perbandingan string (panjang sama).
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/**
 * Hash password berbasis PBKDF2-HMAC-SHA256 (Web Crypto, aman di Workers,
 * tanpa dependensi Node).
 *
 * Penyimpanan: `hash` (hex) dan `salt` (hex) disimpan di kolom terpisah
 * (`users.password_hash` / `users.password_salt`). Tidak ada prefix/format
 * gabungan — verifikasi men-derive ulang dari salt tersimpan.
 *
 * Catatan: lebih kuat dari plain SHA, lebih lemah dari Argon2/scrypt. Jumlah
 * iterasi (PASS_ITER) di bawah rekomendasi OWASP terbaru untuk PBKDF2-SHA256
 * (lihat docs/recommendations bila ingin menaikkan + skema migrasi rehash).
 */
const PASS_ITER = 50_000;

export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const salt = bytesToHex(saltBytes);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: PASS_ITER, hash: "SHA-256" },
    baseKey,
    256,
  );
  const hash = bytesToHex(bits);
  return { hash, salt };
}

export async function verifyPassword(password: string, saltHex: string, expectedHashHex: string): Promise<boolean> {
  const { hash } = await hashPassword(password, saltHex);
  return timingSafeEqual(hash, expectedHashHex);
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
