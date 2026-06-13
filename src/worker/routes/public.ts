import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { ok } from "../lib/response";
import { ratingAvg } from "../services/product-helpers";

const app = new Hono<AppContext>({ strict: false });

app.get("/bootstrap", async (c) => {
  const settings = await c.env.DB.prepare(
    "SELECT key, value FROM app_settings WHERE key IN ('maintenance_mode','maintenance_message','manual_bank_enabled','manual_bank_name','manual_bank_account','manual_bank_holder','manual_bank_note')",
  ).all<{ key: string; value: string }>();
  const map = new Map((settings.results ?? []).map((r) => [r.key, r.value]));
  const user = c.get("user");
  const manualBankEnabled = map.get("manual_bank_enabled") === "1";
  return ok(c, {
    appName: c.env.APP_NAME,
    maintenance: {
      active: map.get("maintenance_mode") === "1",
      message: map.get("maintenance_message") ?? "",
    },
    paymentOptions: {
      qris: true,
      bankTransfer: manualBankEnabled && !!map.get("manual_bank_account"),
      wallet: true,
    },
    manualBank: manualBankEnabled
      ? {
          name: map.get("manual_bank_name") ?? "",
          account: map.get("manual_bank_account") ?? "",
          holder: map.get("manual_bank_holder") ?? "",
          note: map.get("manual_bank_note") ?? "",
        }
      : null,
    user: user
      ? {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          balanceCents: user.balanceCents,
        }
      : null,
  });
});

app.get("/categories", async (c) => {
  const rs = await c.env.DB.prepare(
    "SELECT id, slug, name, description, icon FROM categories ORDER BY sort_order, name",
  ).all<{ id: string; slug: string; name: string; description: string | null; icon: string | null }>();
  return ok(c, rs.results ?? []);
});

const ProductsQuery = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(64).optional(),
  min_price: z.coerce.number().int().nonnegative().optional(),
  max_price: z.coerce.number().int().nonnegative().optional(),
  in_stock: z.enum(["1", "0"]).optional(),
  ready: z.enum(["1", "0"]).optional(),
  sort: z
    .enum(["newest", "popular", "best_seller", "cheapest", "expensive"])
    .optional()
    .default("newest"),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(60).optional().default(24),
});

app.get("/products", async (c) => {
  const parsed = ProductsQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "validation", message: "Parameter tidak valid." } }, 400);
  }
  const q = parsed.data;
  const where: string[] = ["p.status='active'"];
  const binds: any[] = [];
  if (q.q) {
    where.push("(p.name LIKE ? OR p.description LIKE ?)");
    binds.push(`%${q.q}%`, `%${q.q}%`);
  }
  if (q.category) {
    where.push("c.slug = ?");
    binds.push(q.category);
  }
  if (typeof q.min_price === "number") {
    where.push("COALESCE(p.sale_price_cents, p.price_cents) >= ?");
    binds.push(q.min_price);
  }
  if (typeof q.max_price === "number") {
    where.push("COALESCE(p.sale_price_cents, p.price_cents) <= ?");
    binds.push(q.max_price);
  }
  // stok dihitung lewat subquery
  const stockExpr = `(SELECT COUNT(*) FROM product_inventory_items i WHERE i.product_id = p.id AND i.status='available')`;
  if (q.in_stock === "1" || q.ready === "1") {
    where.push(`${stockExpr} > 0`);
  }
  if (q.in_stock === "0") {
    where.push(`${stockExpr} = 0`);
  }
  let order = "p.created_at DESC";
  if (q.sort === "popular") order = "p.sales_count DESC, p.created_at DESC";
  else if (q.sort === "best_seller") order = "p.sales_count DESC";
  else if (q.sort === "cheapest")
    order = "COALESCE(p.sale_price_cents, p.price_cents) ASC, p.created_at DESC";
  else if (q.sort === "expensive")
    order = "COALESCE(p.sale_price_cents, p.price_cents) DESC, p.created_at DESC";

  const limit = q.page_size;
  const offset = (q.page - 1) * limit;
  const sql = `
    SELECT p.id, p.sku, p.slug, p.name, p.thumbnail_url, p.price_cents,
           p.sale_price_cents, p.duration_label, p.sales_count, p.rating_sum,
           p.rating_count, p.created_at,
           c.id AS category_id, c.slug AS category_slug, c.name AS category_name,
           ${stockExpr} AS available_stock
      FROM products p
      JOIN categories c ON c.id = p.category_id
     WHERE ${where.join(" AND ")}
     ORDER BY ${order}
     LIMIT ? OFFSET ?`;
  binds.push(limit, offset);

  const data = await c.env.DB.prepare(sql).bind(...binds).all<any>();

  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM products p JOIN categories c ON c.id=p.category_id WHERE ${where.join(" AND ")}`,
  )
    .bind(...binds.slice(0, binds.length - 2))
    .first<{ c: number }>();

  const items = (data.results ?? []).map((r) => ({
    id: r.id,
    sku: r.sku,
    slug: r.slug,
    name: r.name,
    thumbnailUrl: r.thumbnail_url,
    priceCents: r.price_cents,
    salePriceCents: r.sale_price_cents,
    effectivePriceCents: r.sale_price_cents ?? r.price_cents,
    durationLabel: r.duration_label,
    stock: r.available_stock,
    isReady: r.available_stock > 0,
    ratingAvg: ratingAvg(r.rating_sum, r.rating_count),
    ratingCount: r.rating_count,
    salesCount: r.sales_count,
    createdAt: r.created_at,
    category: { id: r.category_id, slug: r.category_slug, name: r.category_name },
  }));

  return ok(c, {
    items,
    pagination: { page: q.page, pageSize: limit, total: total?.c ?? 0 },
  });
});

app.get("/products/:slug", async (c) => {
  const slug = c.req.param("slug");
  const stockExpr = `(SELECT COUNT(*) FROM product_inventory_items i WHERE i.product_id = p.id AND i.status='available')`;
  const r = await c.env.DB.prepare(
    `SELECT p.*, c.id AS category_id, c.slug AS category_slug, c.name AS category_name,
            ${stockExpr} AS available_stock
       FROM products p
       JOIN categories c ON c.id = p.category_id
      WHERE p.slug = ? AND p.status='active'`,
  )
    .bind(slug)
    .first<any>();
  if (!r) return c.json({ ok: false, error: { code: "not_found", message: "Produk tidak ditemukan." } }, 404);

  const images = await c.env.DB.prepare(
    "SELECT id, url FROM product_images WHERE product_id = ? ORDER BY sort_order, created_at",
  )
    .bind(r.id)
    .all<{ id: string; url: string }>();

  const tiers = await c.env.DB.prepare(
    "SELECT min_qty, unit_price_cents FROM product_price_tiers WHERE product_id = ? ORDER BY min_qty",
  )
    .bind(r.id)
    .all<{ min_qty: number; unit_price_cents: number }>();

  const reviews = await c.env.DB.prepare(
    `SELECT rv.id, rv.rating, rv.comment, rv.created_at, u.username
       FROM reviews rv
       JOIN users u ON u.id = rv.user_id
      WHERE rv.product_id = ? AND rv.status = 'approved'
      ORDER BY rv.created_at DESC LIMIT 50`,
  )
    .bind(r.id)
    .all<{ id: string; rating: number; comment: string; created_at: number; username: string }>();

  let reviewImages: Record<string, { id: string; url: string }[]> = {};
  if ((reviews.results ?? []).length > 0) {
    const ids = reviews.results!.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");
    const ri = await c.env.DB.prepare(
      `SELECT review_id, id, url FROM review_images WHERE review_id IN (${placeholders}) ORDER BY sort_order`,
    )
      .bind(...ids)
      .all<{ review_id: string; id: string; url: string }>();
    for (const x of ri.results ?? []) {
      (reviewImages[x.review_id] ||= []).push({ id: x.id, url: x.url });
    }
  }

  const detail = {
    id: r.id,
    sku: r.sku,
    slug: r.slug,
    name: r.name,
    description: r.description,
    thumbnailUrl: r.thumbnail_url,
    priceCents: r.price_cents,
    salePriceCents: r.sale_price_cents,
    effectivePriceCents: r.sale_price_cents ?? r.price_cents,
    durationLabel: r.duration_label,
    warrantyNote: r.warranty_note,
    stock: r.available_stock,
    isReady: r.available_stock > 0,
    ratingAvg: ratingAvg(r.rating_sum, r.rating_count),
    ratingCount: r.rating_count,
    salesCount: r.sales_count,
    createdAt: r.created_at,
    category: { id: r.category_id, slug: r.category_slug, name: r.category_name },
    images: images.results ?? [],
    priceTiers: (tiers.results ?? []).map((t) => ({ minQty: t.min_qty, unitPriceCents: t.unit_price_cents })),
    reviews: (reviews.results ?? []).map((rv) => ({
      id: rv.id,
      rating: rv.rating,
      comment: rv.comment,
      username: rv.username,
      createdAt: rv.created_at,
      images: reviewImages[rv.id] ?? [],
    })),
  };

  return ok(c, detail);
});

app.get("/home", async (c) => {
  const stockExpr = `(SELECT COUNT(*) FROM product_inventory_items i WHERE i.product_id = p.id AND i.status='available')`;
  const baseFields = `p.id, p.sku, p.slug, p.name, p.thumbnail_url,
                      p.price_cents, p.sale_price_cents, p.duration_label,
                      p.sales_count, p.rating_sum, p.rating_count, p.created_at,
                      c.id AS category_id, c.slug AS category_slug, c.name AS category_name,
                      ${stockExpr} AS available_stock`;
  const rsLatest = await c.env.DB.prepare(
    `SELECT ${baseFields} FROM products p JOIN categories c ON c.id=p.category_id
     WHERE p.status='active' ORDER BY p.created_at DESC LIMIT 12`,
  ).all<any>();
  const rsPopular = await c.env.DB.prepare(
    `SELECT ${baseFields} FROM products p JOIN categories c ON c.id=p.category_id
     WHERE p.status='active' ORDER BY p.sales_count DESC, p.rating_count DESC LIMIT 12`,
  ).all<any>();
  const rsPromo = await c.env.DB.prepare(
    `SELECT ${baseFields} FROM products p JOIN categories c ON c.id=p.category_id
     WHERE p.status='active' AND p.sale_price_cents IS NOT NULL ORDER BY p.created_at DESC LIMIT 12`,
  ).all<any>();
  const rsReady = await c.env.DB.prepare(
    `SELECT ${baseFields} FROM products p JOIN categories c ON c.id=p.category_id
     WHERE p.status='active' AND ${stockExpr} > 0 ORDER BY p.created_at DESC LIMIT 12`,
  ).all<any>();

  const map = (rs: any) =>
    (rs.results ?? []).map((r: any) => ({
      id: r.id,
      sku: r.sku,
      slug: r.slug,
      name: r.name,
      thumbnailUrl: r.thumbnail_url,
      priceCents: r.price_cents,
      salePriceCents: r.sale_price_cents,
      effectivePriceCents: r.sale_price_cents ?? r.price_cents,
      durationLabel: r.duration_label,
      stock: r.available_stock,
      isReady: r.available_stock > 0,
      ratingAvg: ratingAvg(r.rating_sum, r.rating_count),
      ratingCount: r.rating_count,
      salesCount: r.sales_count,
      createdAt: r.created_at,
      category: { id: r.category_id, slug: r.category_slug, name: r.category_name },
    }));

  return ok(c, {
    latest: map(rsLatest),
    popular: map(rsPopular),
    promo: map(rsPromo),
    ready: map(rsReady),
  });
});

export default app;
