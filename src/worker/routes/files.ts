import { Hono } from "hono";
import type { AppContext } from "../env";

const app = new Hono<AppContext>({ strict: false });

/**
 * Daftar prefix folder yang dianggap sensitif: hanya boleh diakses oleh
 * admin atau user pemilik order terkait. Bukti transfer manual jelas
 * mengandung data finansial pribadi.
 */
const PRIVATE_PREFIXES = ["proofs/"];

function isPrivateKey(key: string): boolean {
  return PRIVATE_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Reverse path traversal & key sanity check.
 *  - tolak segmen `..` / absolute path
 *  - tolak NUL bytes
 *  - batasi panjang
 */
function isSafeKey(key: string): boolean {
  if (!key || key.length > 512) return false;
  if (key.includes("\0")) return false;
  if (key.startsWith("/")) return false;
  for (const seg of key.split("/")) {
    if (seg === "" || seg === "." || seg === "..") return false;
  }
  return true;
}

app.get("/*", async (c) => {
  const url = new URL(c.req.url);
  const key = decodeURIComponent(url.pathname.replace(/^\/api\/files\/?/, ""));
  if (!isSafeKey(key)) return c.text("Not found", 404);

  if (isPrivateKey(key)) {
    const user = c.get("user");
    const admin = c.get("admin");
    if (!user && !admin) return c.text("Unauthorized", 401);
    if (!admin && user) {
      // Verifikasi: file ini benar-benar milik salah satu order user.
      const fullUrl = `/api/files/${key}`;
      const owned = await c.env.DB.prepare(
        `SELECT 1 AS x FROM payments p
            JOIN orders o ON o.id = p.order_id
           WHERE p.proof_url = ? AND o.user_id = ?
           LIMIT 1`,
      )
        .bind(fullUrl, user.id)
        .first<{ x: number }>();
      if (!owned) return c.text("Forbidden", 403);
    }
  }

  const obj = await c.env.R2.get(key);
  if (!obj) return c.text("Not found", 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  // File privat tidak boleh di-cache di proxy/CDN.
  if (isPrivateKey(key)) {
    headers.set("Cache-Control", "private, max-age=0, no-store");
  } else {
    headers.set("Cache-Control", "public, max-age=86400");
  }
  return new Response(obj.body, { headers });
});

export default app;
