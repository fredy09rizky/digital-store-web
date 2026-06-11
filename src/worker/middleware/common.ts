import type { MiddlewareHandler } from "hono";
import type { AppContext } from "../env";

/**
 * Bangun string Content-Security-Policy.
 *
 * Strict tapi cukup permisif untuk kebutuhan aplikasi:
 *   - script: hanya self (Vite hash chunks).
 *   - style:  self + Google Fonts CSS + 'unsafe-inline' untuk style atribut Tailwind v4.
 *   - img:    self + data: + blob: (QR code dirender lewat library di browser, R2 lewat /api/files).
 *   - font:   self + Google Fonts statics.
 *   - connect: self (XHR/fetch ke /api/*).
 *   - frame-ancestors: 'none' (cegah clickjacking).
 */
function buildCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

const CSP_VALUE = buildCsp();

export const attachContext: MiddlewareHandler<AppContext> = async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);

  const ip =
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "0.0.0.0";
  c.set("ip", ip);
  c.set("userAgent", c.req.header("user-agent") || "");

  await next();

  c.header("X-Request-Id", requestId);
  // Header keamanan dasar untuk seluruh response.
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!c.res.headers.has("X-Frame-Options")) c.header("X-Frame-Options", "DENY");
  // CSP hanya pada dokumen HTML; endpoint API & static R2 tidak butuh.
  const contentType = c.res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html") && !c.res.headers.has("Content-Security-Policy")) {
    c.header("Content-Security-Policy", CSP_VALUE);
  }
};
