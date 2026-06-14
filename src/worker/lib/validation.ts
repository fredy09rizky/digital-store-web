// ============================================================
//  Helper validasi tambahan yang dipakai lintas rute.
// ============================================================

// Mendeteksi karakter emoji / pictographic (termasuk simbol & varian).
// Memakai properti Unicode `Extended_Pictographic` plus selektor varian emoji.
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{20E3}]/u;

/** True bila string mengandung emoji. */
export function containsEmoji(value: string): boolean {
  return EMOJI_RE.test(value);
}

/** Pesan standar penolakan emoji. */
export const NO_EMOJI_MSG = "Teks tidak boleh mengandung emoji.";

// ============================================================
//  Sanitasi isi chat (support & refund).
// ============================================================
// Chat MEMPERBOLEHKAN teks normal (UTF-8) dan emoji. Yang dibuang hanyalah
// karakter kontrol berbahaya (NUL, dsb.) kecuali newline (\n) dan tab (\t).
// Hasil di-trim, lalu dipotong ke maksimal CHAT_MSG_MAX karakter.
export const CHAT_MSG_MAX = 1000;

export function sanitizeChatBody(input: string): string {
  // Buang control chars C0 (kecuali \t \n) dan DEL.
  const cleaned = input
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return cleaned.trim().slice(0, CHAT_MSG_MAX);
}

/**
 * Predikat untuk Zod `.refine(...)`. Mengembalikan true (valid) bila nilai
 * bukan string atau tidak mengandung emoji. Aman dipakai pada field
 * optional/nullable (undefined/null dianggap valid).
 */
export function noEmoji(value: unknown): boolean {
  return typeof value !== "string" || !containsEmoji(value);
}

import { z } from "zod";
import type { ZodError } from "zod";

/**
 * Ambil pesan error pertama yang paling berguna dari ZodError, supaya bisa
 * ditampilkan langsung ke admin alih-alih pesan generik "form tidak valid".
 */
export function firstIssueMessage(error: ZodError, fallback: string): string {
  const issue = error.issues[0];
  if (!issue) return fallback;
  return issue.message || fallback;
}

// ============================================================
//  Validasi URL gambar hasil upload.
// ============================================================
//
// Endpoint upload (`/api/upload`) mengembalikan URL relatif aplikasi dalam
// bentuk `/api/files/<key>` (lihat routes/upload.ts). Validator lama memakai
// `z.string().url()` yang HANYA menerima URL absolut (punya skema http/https),
// sehingga path relatif hasil upload sendiri ditolak dengan pesan
// "Invalid URL". Ini bikin form produk/review/bukti transfer gagal disimpan.
//
// Helper di bawah menerima dua bentuk yang sah:
//   1. Path relatif aplikasi yang diawali `/api/files/` (hasil upload kita).
//   2. URL absolut http/https (kalau admin menempel link gambar eksternal).

const UPLOADED_FILE_PATH_RE = /^\/api\/files\/[A-Za-z0-9._\-/]+$/;

export function isImageUrl(value: string): boolean {
  if (UPLOADED_FILE_PATH_RE.test(value)) return true;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Skema Zod untuk satu URL gambar (relatif hasil upload ATAU absolut).
 * Pakai ini menggantikan `z.string().url()` untuk field gambar.
 */
export const imageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(isImageUrl, "URL gambar tidak valid.");
