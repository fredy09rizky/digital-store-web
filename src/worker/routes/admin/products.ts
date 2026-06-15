import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { envInt } from "../../env";
import { fail, ok } from "../../lib/response";
import { now } from "../../lib/time";
import { nanoId, skuFromName } from "../../lib/id";
import { audit } from "../../lib/audit";
import { buildPage, parsePagination } from "../../lib/pagination";
import { hasActiveReservations } from "../../services/inventory-reserve";
import { parseInventoryText } from "../../services/inventory-parser";
import { noEmoji, NO_EMOJI_MSG, firstIssueMessage, imageUrlSchema } from "../../lib/validation";
import { deleteFileObjects } from "../../lib/r2";

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
    description: z.string().trim().max(2000).refine(noEmoji, NO_EMOJI_MSG).default(""),
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
    `INSERT INTO products (id, sku, category_id, name, slug, description, thumbnail_url,
                           price_cents, sale_price_cents, duration_label, warranty_note,
                           status, is_featured, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      sku,
      parsed.data.categoryId,
      parsed.data.name,
      slug,
      parsed.data.description,
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
  // Snapshot gambar lama untuk membersihkan objek R2 yang tidak lagi dipakai
  // setelah edit (thumbnail diganti / gambar galeri dibuang).
  const [oldProd, oldImgs] = await Promise.all([
    c.env.DB.prepare("SELECT thumbnail_url FROM products WHERE id = ?")
      .bind(id)
      .first<{ thumbnail_url: string | null }>(),
    c.env.DB.prepare("SELECT url FROM product_images WHERE product_id = ?")
      .bind(id)
      .all<{ url: string }>(),
  ]);
  const ts = now();
  await c.env.DB.prepare(
    `UPDATE products SET category_id=?, name=?, description=?, thumbnail_url=?,
                         price_cents=?, sale_price_cents=?, duration_label=?, warranty_note=?,
                         status=?, is_featured=?, updated_at=?
     WHERE id=?`,
  )
    .bind(
      parsed.data.categoryId,
      parsed.data.name,
      parsed.data.description,
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
  // Hapus objek R2 milik gambar lama yang tidak lagi direferensikan.
  const newUrls = new Set<string>(
    [parsed.data.thumbnailUrl ?? null, ...parsed.data.imageUrls].filter(
      (u): u is string => !!u,
    ),
  );
  const removed = [oldProd?.thumbnail_url ?? null, ...(oldImgs.results ?? []).map((r) => r.url)].filter(
    (u): u is string => !!u && !newUrls.has(u),
  );
  await deleteFileObjects(c.env, removed);
  return ok(c, { ok: true });
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  if (await hasActiveReservations(c.env.DB, id)) {
    return fail(c, "locked", "Produk memiliki reservasi aktif.", 423);
  }
  // Kumpulkan gambar produk untuk dihapus dari R2 setelah baris produk dihapus.
  const [prod, imgs] = await Promise.all([
    c.env.DB.prepare("SELECT thumbnail_url FROM products WHERE id = ?")
      .bind(id)
      .first<{ thumbnail_url: string | null }>(),
    c.env.DB.prepare("SELECT url FROM product_images WHERE product_id = ?")
      .bind(id)
      .all<{ url: string }>(),
  ]);
  await c.env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  await deleteFileObjects(c.env, [
    prod?.thumbnail_url ?? null,
    ...(imgs.results ?? []).map((r) => r.url),
  ]);
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

  // Batas maksimal stok per produk. Yang dihitung adalah stok "hidup"
  // (available + reserved); sold (historis) dan invalid (dinonaktifkan) tidak
  // ikut. Default 1000, dapat dinaikkan lewat MAX_STOCK_PER_PRODUCT di
  // wrangler.toml lalu deploy ulang.
  const maxStock = envInt(c.env.MAX_STOCK_PER_PRODUCT, 1000);
  const liveRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS c FROM product_inventory_items WHERE product_id = ? AND status IN ('available','reserved')",
  )
    .bind(parsed.data.productId)
    .first<{ c: number }>();
  const live = liveRow?.c ?? 0;
  if (live + result.items.length > maxStock) {
    const remaining = Math.max(0, maxStock - live);
    return fail(
      c,
      "stock_limit_exceeded",
      `Melebihi batas stok. Sisa kuota ${remaining.toLocaleString("id-ID")} dari maks ${maxStock.toLocaleString("id-ID")} item.`,
      400,
      { max: maxStock, live, remaining, attempted: result.items.length },
    );
  }

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
  const p = parsePagination({ query: (k) => c.req.query(k) });

  const [rows, total, statsRows] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, payload_email, payload_password, payload_note, payload_expiry, payload_extra, status,
              reserved_for_order_id, sold_to_order_id, created_at
         FROM product_inventory_items WHERE product_id = ?
        ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(id, p.pageSize, p.offset)
      .all<any>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS c FROM product_inventory_items WHERE product_id = ?",
    )
      .bind(id)
      .first<{ c: number }>(),
    // Statistik dihitung lewat GROUP BY status sehingga selalu akurat,
    // tidak terpengaruh pagination (bug lama: stats dihitung dari subset
    // baris yang dibatasi LIMIT).
    c.env.DB.prepare(
      "SELECT status, COUNT(*) AS c FROM product_inventory_items WHERE product_id = ? GROUP BY status",
    )
      .bind(id)
      .all<{ status: string; c: number }>(),
  ]);

  const stats = { total: 0, available: 0, reserved: 0, sold: 0, invalid: 0 };
  for (const r of statsRows.results ?? []) {
    const n = r.c ?? 0;
    stats.total += n;
    if (r.status === "available" || r.status === "reserved" || r.status === "sold" || r.status === "invalid") {
      stats[r.status] = n;
    }
  }

  return ok(c, { ...buildPage(rows.results ?? [], total?.c ?? 0, p), stats });
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
