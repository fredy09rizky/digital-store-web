import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/response";
import { now } from "../../lib/time";
import { nanoId, skuFromName } from "../../lib/id";
import { audit } from "../../lib/audit";
import { hasActiveReservations } from "../../services/inventory-reserve";
import { parseInventoryText } from "../../services/inventory-parser";
import { noEmoji, NO_EMOJI_MSG, firstIssueMessage, imageUrlSchema } from "../../lib/validation";

const app = new Hono<AppContext>({ strict: false });

app.get("/", async (c) => {
  const q = c.req.query("q") ?? "";
  const where = q ? "WHERE p.name LIKE ?" : "";
  const stockExpr = `(SELECT COUNT(*) FROM product_inventory_items i WHERE i.product_id=p.id AND i.status='available')`;
  const reservedExpr = `(SELECT COUNT(*) FROM product_inventory_items i WHERE i.product_id=p.id AND i.status='reserved')`;
  const sql = `SELECT p.*, c.name AS category_name, ${stockExpr} AS stk, ${reservedExpr} AS rsv
               FROM products p JOIN categories c ON c.id = p.category_id
               ${where} ORDER BY p.created_at DESC LIMIT 200`;
  const stmt = c.env.DB.prepare(sql);
  const rs = q ? await stmt.bind(`%${q}%`).all<any>() : await stmt.all<any>();
  return ok(c, rs.results ?? []);
});

// Detail satu produk lengkap dengan tier harga & galeri gambar. Dipakai oleh
// modal edit di admin agar tier/gambar yang sudah ada tidak hilang saat disimpan
// ulang (PUT menulis ulang penuh kedua relasi tersebut).
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const p = await c.env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first<any>();
  if (!p) return fail(c, "not_found", "Produk tidak ditemukan.", 404);
  const [tiers, images] = await Promise.all([
    c.env.DB.prepare(
      "SELECT min_qty, unit_price_cents FROM product_price_tiers WHERE product_id = ? ORDER BY min_qty",
    )
      .bind(id)
      .all<{ min_qty: number; unit_price_cents: number }>(),
    c.env.DB.prepare(
      "SELECT url FROM product_images WHERE product_id = ? ORDER BY sort_order, created_at",
    )
      .bind(id)
      .all<{ url: string }>(),
  ]);
  return ok(c, {
    ...p,
    priceTiers: (tiers.results ?? []).map((t) => ({ minQty: t.min_qty, unitPriceCents: t.unit_price_cents })),
    imageUrls: (images.results ?? []).map((i) => i.url),
  });
});

const ProductBody = z
  .object({
    categoryId: z.string().min(1),
    name: z.string().trim().min(2).max(120).refine(noEmoji, NO_EMOJI_MSG),
    shortDesc: z.string().trim().max(300).refine(noEmoji, NO_EMOJI_MSG).default(""),
    description: z.string().trim().max(8000).refine(noEmoji, NO_EMOJI_MSG).default(""),
    thumbnailUrl: imageUrlSchema.optional().nullable(),
    priceCents: z.coerce.number().int().min(0).max(1_000_000_000),
    salePriceCents: z.coerce.number().int().min(0).max(1_000_000_000).nullable().optional(),
    durationLabel: z.string().trim().max(40).refine(noEmoji, NO_EMOJI_MSG).optional().nullable(),
    warrantyNote: z.string().trim().max(500).refine(noEmoji, NO_EMOJI_MSG).optional().nullable(),
    isFeatured: z.boolean().optional().default(false),
    status: z.enum(["active", "hidden"]).default("active"),
    priceTiers: z
      .array(z.object({ minQty: z.coerce.number().int().min(2), unitPriceCents: z.coerce.number().int().min(0) }))
      .max(8)
      .default([]),
    imageUrls: z.array(imageUrlSchema).max(5).default([]),
  })
  .superRefine((data, ctx) => {
    // Harga promo harus lebih murah dari harga normal (kalau diisi).
    if (data.salePriceCents != null && data.salePriceCents >= data.priceCents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["salePriceCents"],
        message: "Harga promo harus lebih kecil dari harga normal.",
      });
    }
    // minQty tier tidak boleh duplikat (ambigu saat memilih tier).
    const seen = new Set<number>();
    for (let i = 0; i < data.priceTiers.length; i++) {
      const t = data.priceTiers[i];
      if (seen.has(t.minQty)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["priceTiers", i, "minQty"],
          message: `Tier dengan min qty ${t.minQty} sudah ada.`,
        });
      }
      seen.add(t.minQty);
      // Tier grosir mestinya tidak lebih mahal dari harga normal.
      if (t.unitPriceCents > data.priceCents) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["priceTiers", i, "unitPriceCents"],
          message: "Harga tier tidak boleh lebih besar dari harga normal.",
        });
      }
    }
  });

app.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ProductBody.safeParse(body);
  if (!parsed.success)
    return fail(c, "validation", firstIssueMessage(parsed.error, "Form produk tidak valid."), 400, parsed.error.flatten());
  const ts = now();
  const id = nanoId("prd");
  const slug = `${parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${nanoId("", 4)}`;
  const sku = skuFromName(parsed.data.name);
  await c.env.DB.prepare(
    `INSERT INTO products (id, sku, category_id, name, slug, description, short_desc, thumbnail_url,
                           price_cents, sale_price_cents, duration_label, warranty_note,
                           status, is_featured, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      sku,
      parsed.data.categoryId,
      parsed.data.name,
      slug,
      parsed.data.description,
      parsed.data.shortDesc,
      parsed.data.thumbnailUrl ?? null,
      parsed.data.priceCents,
      parsed.data.salePriceCents ?? null,
      parsed.data.durationLabel ?? null,
      parsed.data.warrantyNote ?? null,
      parsed.data.status,
      parsed.data.isFeatured ? 1 : 0,
      ts,
      ts,
    )
    .run();
  for (let i = 0; i < parsed.data.imageUrls.length; i++) {
    await c.env.DB.prepare(
      "INSERT INTO product_images (id, product_id, url, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(nanoId("pi"), id, parsed.data.imageUrls[i], i, ts)
      .run();
  }
  for (const t of parsed.data.priceTiers) {
    await c.env.DB.prepare(
      "INSERT INTO product_price_tiers (id, product_id, min_qty, unit_price_cents, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(nanoId("tier"), id, t.minQty, t.unitPriceCents, ts)
      .run();
  }
  await audit(c.env, {
    actorKind: "admin",
    actorId: c.get("admin")!.id,
    action: "admin.product.create",
    targetKind: "product",
    targetId: id,
    meta: { name: parsed.data.name },
  });
  return ok(c, { id, sku, slug });
});

app.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = ProductBody.safeParse(body);
  if (!parsed.success)
    return fail(c, "validation", firstIssueMessage(parsed.error, "Form produk tidak valid."), 400, parsed.error.flatten());
  // Tolak bila ada reservasi aktif (kunci edit)
  if (await hasActiveReservations(c.env.DB, id)) {
    return fail(c, "locked", "Produk sedang memiliki reservasi aktif. Edit ditangguhkan.", 423);
  }
  const ts = now();
  await c.env.DB.prepare(
    `UPDATE products SET category_id=?, name=?, description=?, short_desc=?, thumbnail_url=?,
                         price_cents=?, sale_price_cents=?, duration_label=?, warranty_note=?,
                         status=?, is_featured=?, updated_at=?
     WHERE id=?`,
  )
    .bind(
      parsed.data.categoryId,
      parsed.data.name,
      parsed.data.description,
      parsed.data.shortDesc,
      parsed.data.thumbnailUrl ?? null,
      parsed.data.priceCents,
      parsed.data.salePriceCents ?? null,
      parsed.data.durationLabel ?? null,
      parsed.data.warrantyNote ?? null,
      parsed.data.status,
      parsed.data.isFeatured ? 1 : 0,
      ts,
      id,
    )
    .run();
  await c.env.DB.prepare("DELETE FROM product_images WHERE product_id = ?").bind(id).run();
  for (let i = 0; i < parsed.data.imageUrls.length; i++) {
    await c.env.DB.prepare(
      "INSERT INTO product_images (id, product_id, url, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(nanoId("pi"), id, parsed.data.imageUrls[i], i, ts)
      .run();
  }
  await c.env.DB.prepare("DELETE FROM product_price_tiers WHERE product_id = ?").bind(id).run();
  for (const t of parsed.data.priceTiers) {
    await c.env.DB.prepare(
      "INSERT INTO product_price_tiers (id, product_id, min_qty, unit_price_cents, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(nanoId("tier"), id, t.minQty, t.unitPriceCents, ts)
      .run();
  }
  await audit(c.env, {
    actorKind: "admin",
    actorId: c.get("admin")!.id,
    action: "admin.product.update",
    targetKind: "product",
    targetId: id,
  });
  return ok(c, { ok: true });
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  if (await hasActiveReservations(c.env.DB, id)) {
    return fail(c, "locked", "Produk memiliki reservasi aktif.", 423);
  }
  await c.env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  await audit(c.env, {
    actorKind: "admin",
    actorId: c.get("admin")!.id,
    action: "admin.product.delete",
    targetKind: "product",
    targetId: id,
  });
  return ok(c, { ok: true });
});

// Stok endpoints
const StockUploadBody = z.object({
  productId: z.string().min(1),
  text: z.string().min(1).max(2_000_000),
});

app.post("/stock/upload", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = StockUploadBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Input tidak valid.");
  const result = parseInventoryText(parsed.data.text);
  if (!result.ok)
    return fail(c, "parse_failed", "Beberapa baris tidak valid.", 400, {
      errors: result.errors,
      validCount: result.items.length,
    });
  if (result.items.length === 0) return fail(c, "empty", "Tidak ada item valid.");
  const ts = now();
  // Insert dalam batch
  for (const it of result.items) {
    await c.env.DB.prepare(
      `INSERT INTO product_inventory_items (id, product_id, payload_email, payload_password, payload_note, payload_expiry, payload_extra, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)`,
    )
      .bind(
        nanoId("inv"),
        parsed.data.productId,
        it.email,
        it.password,
        it.note ?? null,
        it.expiry ?? null,
        it.extra ?? null,
        ts,
        ts,
      )
      .run();
  }
  await audit(c.env, {
    actorKind: "admin",
    actorId: c.get("admin")!.id,
    action: "admin.stock.upload",
    targetKind: "product",
    targetId: parsed.data.productId,
    meta: { added: result.items.length },
  });
  return ok(c, { added: result.items.length });
});

app.get("/:id/stock", async (c) => {
  const id = c.req.param("id");
  const rs = await c.env.DB.prepare(
    `SELECT id, payload_email, payload_password, payload_note, payload_expiry, payload_extra, status,
            reserved_for_order_id, sold_to_order_id, created_at
       FROM product_inventory_items WHERE product_id = ? ORDER BY created_at DESC LIMIT 500`,
  )
    .bind(id)
    .all<any>();
  return ok(c, rs.results ?? []);
});

const MarkInvalidBody = z.object({ ids: z.array(z.string()).min(1).max(200) });
app.post("/stock/mark-invalid", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = MarkInvalidBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Input tidak valid.");
  const placeholders = parsed.data.ids.map(() => "?").join(",");
  await c.env.DB.prepare(
    `UPDATE product_inventory_items SET status='invalid', updated_at = ?
       WHERE id IN (${placeholders}) AND status = 'available'`,
  )
    .bind(now(), ...parsed.data.ids)
    .run();
  await audit(c.env, {
    actorKind: "admin",
    actorId: c.get("admin")!.id,
    action: "admin.stock.mark_invalid",
    meta: { count: parsed.data.ids.length },
  });
  return ok(c, { ok: true });
});

export default app;
