import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/response";
import { now } from "../../lib/time";
import { nanoId } from "../../lib/id";
import { audit } from "../../lib/audit";
import { noEmoji, NO_EMOJI_MSG } from "../../lib/validation";

const app = new Hono<AppContext>({ strict: false });

app.get("/", async (c) => {
  const rs = await c.env.DB.prepare(
    "SELECT id, slug, name, description, icon, sort_order FROM categories ORDER BY sort_order, name",
  ).all<any>();
  return ok(c, rs.results ?? []);
});

const CatBody = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Slug hanya boleh huruf kecil, angka, dan strip."),
  name: z.string().trim().min(2).max(80).refine(noEmoji, NO_EMOJI_MSG),
  description: z.string().trim().max(300).refine(noEmoji, NO_EMOJI_MSG).optional().nullable(),
  icon: z.string().trim().max(8).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional().default(0),
});

app.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CatBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Form kategori tidak valid.");
  // Urutan tampilan wajib unik antar kategori agar urutan katalog deterministik.
  const dupOrder = await c.env.DB.prepare(
    "SELECT id FROM categories WHERE sort_order = ? LIMIT 1",
  )
    .bind(parsed.data.sortOrder)
    .first<{ id: string }>();
  if (dupOrder) {
    return fail(
      c,
      "duplicate_order",
      `Urutan tampilan ${parsed.data.sortOrder} sudah dipakai kategori lain. Pakai angka berbeda.`,
      409,
    );
  }
  const ts = now();
  const id = nanoId("cat");
  try {
    await c.env.DB.prepare(
      `INSERT INTO categories (id, slug, name, description, icon, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, parsed.data.slug, parsed.data.name, parsed.data.description ?? null, parsed.data.icon ?? null, parsed.data.sortOrder, ts, ts)
      .run();
  } catch (e: any) {
    return fail(c, "duplicate", "Slug kategori sudah dipakai.");
  }
  await audit(c.env, {
    actorKind: "admin",
    actorId: c.get("admin")!.id,
    action: "admin.category.create",
    targetKind: "category",
    targetId: id,
  });
  return ok(c, { id });
});

app.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = CatBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Form kategori tidak valid.");
  // Urutan tampilan wajib unik (kecuali dirinya sendiri saat edit).
  const dupOrder = await c.env.DB.prepare(
    "SELECT id FROM categories WHERE sort_order = ? AND id <> ? LIMIT 1",
  )
    .bind(parsed.data.sortOrder, id)
    .first<{ id: string }>();
  if (dupOrder) {
    return fail(
      c,
      "duplicate_order",
      `Urutan tampilan ${parsed.data.sortOrder} sudah dipakai kategori lain. Pakai angka berbeda.`,
      409,
    );
  }
  const ts = now();
  await c.env.DB.prepare(
    "UPDATE categories SET slug=?, name=?, description=?, icon=?, sort_order=?, updated_at=? WHERE id=?",
  )
    .bind(parsed.data.slug, parsed.data.name, parsed.data.description ?? null, parsed.data.icon ?? null, parsed.data.sortOrder, ts, id)
    .run();
  await audit(c.env, {
    actorKind: "admin",
    actorId: c.get("admin")!.id,
    action: "admin.category.update",
    targetKind: "category",
    targetId: id,
  });
  return ok(c, { ok: true });
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  // Tolak jika masih ada produk pada kategori ini.
  const used = await c.env.DB.prepare("SELECT COUNT(*) AS c FROM products WHERE category_id = ?")
    .bind(id)
    .first<{ c: number }>();
  if ((used?.c ?? 0) > 0) {
    return fail(c, "in_use", "Kategori masih dipakai produk. Pindahkan dulu produknya.", 409);
  }
  await c.env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
  await audit(c.env, {
    actorKind: "admin",
    actorId: c.get("admin")!.id,
    action: "admin.category.delete",
    targetKind: "category",
    targetId: id,
  });
  return ok(c, { ok: true });
});

export default app;
