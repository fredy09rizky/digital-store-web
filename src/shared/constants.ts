export const APP_NAME_DEFAULT = "Pasar Premium";

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "expired",
  "cancelled",
  "refunded",
] as const;

export const PAYMENT_METHODS = ["qris", "bank_transfer", "wallet"] as const;

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;

// Review berupa teks saja (UTF-8 + emoji). Tidak ada upload foto — menghindari
// pemborosan R2 storage & beban moderasi gambar.
export const REVIEW_COMMENT_MAX = 500;

// Batas "sanity" qty per item di keranjang. Ini BUKAN batas bisnis — batas
// pembelian yang sebenarnya adalah stok tersedia (divalidasi backend saat
// add/update cart dan saat reservasi order). Angka tinggi ini hanya mencegah
// input rusak/jahat (mis. qty raksasa) tanpa perlu diubah saat admin mengganti
// MAX_STOCK_PER_PRODUCT.
export const CART_QTY_MAX = 1_000_000;

// ============================================================
//  Aturan registrasi akun (dipakai bersama client + worker).
//  Backend tetap sumber kebenaran; client memakai ini untuk
//  validasi live + pesan yang konsisten.
// ============================================================

// --- Username ---
export const USERNAME_MIN = 5;
export const USERNAME_MAX = 20;
// Huruf, angka, garis bawah. TIDAK termasuk titik (.), plus (+), atau strip (-).
export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

// --- Nama tampilan ---
export const DISPLAY_NAME_MAX = 30;

// --- Password ---
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 30;
// Simbol yang diizinkan sekaligus wajib minimal satu.
export const PASSWORD_SYMBOLS = "@!#$%&*";
// Opsi A: password hanya boleh huruf, angka, dan simbol di atas.
export const PASSWORD_ALLOWED_REGEX = /^[A-Za-z0-9@!#$%&*]+$/;

// --- Email ---
export const EMAIL_MAX_DOTS = 3;
// Domain email yang diizinkan (provider populer). Tambah di sini bila perlu.
export const ALLOWED_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.id",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
];

/**
 * Validator registrasi. Semua mengembalikan pesan error (string) bila tidak
 * valid, atau `null` bila valid. Pesan ditulis jelas & spesifik untuk
 * ditampilkan langsung ke user.
 */
export function validateUsername(username: string): string | null {
  const v = username.trim();
  if (v.length < USERNAME_MIN || v.length > USERNAME_MAX) {
    return `Username harus ${USERNAME_MIN}–${USERNAME_MAX} karakter.`;
  }
  if (v.includes("+")) return "Username tidak boleh mengandung tanda plus (+).";
  if (v.includes(".")) return "Username tidak boleh mengandung titik (.).";
  if (!USERNAME_REGEX.test(v)) {
    return "Username hanya boleh huruf, angka, dan garis bawah (_).";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  const v = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return "Format email tidak valid.";
  }
  if (v.includes("+")) {
    return "Email tidak boleh mengandung tanda plus (+).";
  }
  const dots = (v.match(/\./g) || []).length;
  if (dots > EMAIL_MAX_DOTS) {
    return `Email tidak boleh mengandung lebih dari ${EMAIL_MAX_DOTS} titik.`;
  }
  const domain = v.split("@")[1] ?? "";
  if (!ALLOWED_EMAIL_DOMAINS.includes(domain)) {
    return "Domain email tidak didukung. Gunakan Gmail, Outlook/Hotmail, Yahoo, iCloud/Apple, atau Proton.";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Password minimal ${PASSWORD_MIN} karakter.`;
  if (password.length > PASSWORD_MAX) return `Password maksimal ${PASSWORD_MAX} karakter.`;
  if (!/[a-z]/.test(password)) return "Password harus mengandung huruf kecil.";
  if (!/[A-Z]/.test(password)) return "Password harus mengandung huruf besar.";
  if (!/[0-9]/.test(password)) return "Password harus mengandung angka.";
  if (!/[@!#$%&*]/.test(password)) {
    return "Password harus mengandung minimal satu simbol (@ ! # $ % & *).";
  }
  if (!PASSWORD_ALLOWED_REGEX.test(password)) {
    return "Password hanya boleh huruf, angka, dan simbol @ ! # $ % & *.";
  }
  return null;
}

export function validateDisplayName(displayName: string): string | null {
  if (displayName.trim().length > DISPLAY_NAME_MAX) {
    return `Nama tampilan maksimal ${DISPLAY_NAME_MAX} karakter.`;
  }
  return null;
}
