import { Hono } from "hono";
import type { AppContext } from "../env";
import { fail, ok } from "../lib/response";
import { nanoId } from "../lib/id";
import { rateLimit } from "../lib/rate-limit";

const app = new Hono<AppContext>({ strict: false });

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

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
  if (!fileEntry || typeof fileEntry === "string") return fail(c, "no_file", "File tidak ditemukan.");
  const file = fileEntry as unknown as { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
  if (!ALLOWED.includes(file.type)) return fail(c, "bad_type", "Tipe file tidak didukung.");
  if (file.size > MAX_BYTES) return fail(c, "too_large", `Maksimal ${MAX_BYTES / 1024 / 1024} MB.`);

  const ext = file.type.split("/")[1] || "bin";
  const key = `${folder}/${nanoId("", 12)}.${ext}`;
  const buf = await file.arrayBuffer();
  await c.env.R2.put(key, buf, { httpMetadata: { contentType: file.type } });
  const url = `/api/files/${key}`;
  return ok(c, { url, key, size: file.size, type: file.type });
});

export default app;
