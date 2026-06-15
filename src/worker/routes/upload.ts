import { Hono } from "hono";
import type { AppContext } from "../env";
import { fail, ok } from "../lib/response";
import { nanoId } from "../lib/id";
import { rateLimit } from "../lib/rate-limit";

const app = new Hono<AppContext>({ strict: false });

const MAX_BYTES = 2 * 1024 * 1024;

// Folder tujuan yang sah. Mencegah objek "nyasar" ke prefix sembarangan.
const ALLOWED_FOLDERS = new Set(["products", "proofs", "misc"]);
// Folder yang hanya boleh ditulis admin (gambar produk). User biasa hanya
// butuh `proofs` (bukti transfer) dan `misc`.
const ADMIN_ONLY_FOLDERS = new Set(["products"]);

/**
 * Deteksi tipe gambar dari magic bytes (beberapa byte awal file), bukan dari
 * header Content-Type yang dikirim client — header itu mudah dipalsukan.
 * Mengembalikan MIME sebenarnya atau null bila bukan gambar yang didukung.
 */
function sniffImageType(b: Uint8Array): string | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF: "GIF87a" / "GIF89a"
  if (
    b.length >= 6 &&
    b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
    (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61
  ) {
    return "image/gif";
  }
  // WebP: "RIFF"...."WEBP"
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

app.post("/", async (c) => {
  const user = c.get("user");
  const admin = c.get("admin");
  if (!user && !admin) return fail(c, "unauthenticated", "Login diperlukan untuk upload.", 401);

  const rl = await rateLimit(c.env, {
    key: `rl:upload:${user?.id ?? admin!.id}`,
    windowSeconds: 60,
    max: 30,
  });
  if (!rl.allowed) return fail(c, "rate_limited", "Terlalu banyak upload. Coba sebentar lagi.", 429);

  const ct = c.req.header("content-type") || "";
  if (!ct.startsWith("multipart/form-data")) {
    return fail(c, "invalid_content_type", "Form-data diperlukan.");
  }
  const form = await c.req.formData();
  const fileEntry = form.get("file");
  const folder = (form.get("folder") || "misc").toString().replace(/[^a-z0-9_\-]/gi, "").slice(0, 32) || "misc";
  if (!ALLOWED_FOLDERS.has(folder)) return fail(c, "bad_folder", "Folder tujuan tidak diizinkan.");
  if (ADMIN_ONLY_FOLDERS.has(folder) && !admin) {
    return fail(c, "forbidden", "Folder ini hanya untuk admin.", 403);
  }
  if (!fileEntry || typeof fileEntry === "string") return fail(c, "no_file", "File tidak ditemukan.");
  const file = fileEntry as unknown as { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
  if (file.size > MAX_BYTES) return fail(c, "too_large", `Maksimal ${MAX_BYTES / 1024 / 1024} MB.`);

  const buf = await file.arrayBuffer();
  // Tipe sebenarnya ditentukan dari isi file, bukan dari header client.
  const sniffed = sniffImageType(new Uint8Array(buf.slice(0, 12)));
  if (!sniffed) return fail(c, "bad_type", "File harus gambar PNG, JPEG, WebP, atau GIF yang valid.");

  const ext = sniffed.split("/")[1];
  const key = `${folder}/${nanoId("", 12)}.${ext}`;
  await c.env.R2.put(key, buf, { httpMetadata: { contentType: sniffed } });
  const url = `/api/files/${key}`;
  return ok(c, { url, key, size: file.size, type: sniffed });
});

export default app;
