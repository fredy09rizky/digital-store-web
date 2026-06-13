import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { fail, ok } from "../lib/response";
import { now } from "../lib/time";
import { nanoId } from "../lib/id";
import { effectiveUnitPrice } from "../services/pricing";
import { loadPriceContext } from "../services/product-helpers";
import { CART_QTY_MAX } from "../../shared/constants";

const app = new Hono<AppContext>({ strict: false });

async function ensureCart(env: AppContext["Bindings"], userId: string): Promise<string> {
  const c = await env.DB.prepare("SELECT id FROM carts WHERE user_id = ?")
    .bind(userId)
    .first<{ id: string }>();
  if (c) return c.id;
  const ts = now();
  const id = nanoId("crt");
  await env.DB.prepare("INSERT INTO carts (id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .bind(id, userId, ts, ts)
    .run();
  return id;
}

async function loadCartView(c: Context<AppContext>) {
  const user = c.get("user");
  if (!user) throw new Error("user required");
  const cartId = await ensureCart(c.env, user.id);
  const rows = await c.env.DB.prepare(
    `SELECT ci.id, ci.product_id, ci.qty, p.name, p.slug, p.thumbnail_url, p.price_cents, p.sale_price_cents,
            (SELECT COUNT(*) FROM product_inventory_items i WHERE i.product_id=p.id AND i.status='available') AS stk
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ?
      ORDER BY ci.created_at`,
  )
    .bind(cartId)
    .all<any>();

  let subtotal = 0;
  const items = await Promise.all(
    (rows.results ?? []).map(async (r: any) => {
      const ctx = await loadPriceContext(c.env.DB, r.product_id);
      const eff = effectiveUnitPrice(ctx, r.qty);
      const sub = eff * r.qty;
      subtotal += sub;
      return {
        id: r.id,
        productId: r.product_id,
        productName: r.name,
        productSlug: r.slug,
        thumbnailUrl: r.thumbnail_url,
        qty: r.qty,
        unitPriceCents: r.sale_price_cents ?? r.price_cents,
        effectiveUnitPriceCents: eff,
        subtotalCents: sub,
        stockAvailable: r.stk,
      };
    }),
  );

  const feeRow = await c.env.DB.prepare("SELECT value FROM app_settings WHERE key='service_fee_cents'").first<{
    value: string;
  }>();
  const serviceFee = parseInt(feeRow?.value ?? "0", 10) || 0;
  return {
    items,
    subtotalCents: subtotal,
    discountCents: 0,
    serviceFeeCents: serviceFee,
    totalCents: subtotal + serviceFee,
    voucher: null,
  };
}

app.get("/", async (c) => {
  return ok(c, await loadCartView(c));
});

const AddBody = z.object({
  productId: z.string().min(1).max(64),
  qty: z.coerce.number().int().min(1).max(CART_QTY_MAX),
});

app.post("/add", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = AddBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Input tidak valid.", 400);
  const user = c.get("user")!;
  const ts = now();

  const product = await c.env.DB.prepare(
    `SELECT id, status FROM products WHERE id = ?`,
  )
    .bind(parsed.data.productId)
    .first<{ id: string; status: string }>();
  if (!product) return fail(c, "not_found", "Produk tidak ditemukan.", 404);
  if (product.status !== "active") return fail(c, "unavailable", "Produk tidak tersedia.", 400);

  const cartId = await ensureCart(c.env, user.id);

  // Stok aktif (tidak termasuk reservasi)
  const stk = await c.env.DB.prepare(
    "SELECT COUNT(*) AS c FROM product_inventory_items WHERE product_id = ? AND status='available'",
  )
    .bind(product.id)
    .first<{ c: number }>();
  const stockAvail = stk?.c ?? 0;

  const existing = await c.env.DB.prepare(
    "SELECT id, qty FROM cart_items WHERE cart_id = ? AND product_id = ?",
  )
    .bind(cartId, product.id)
    .first<{ id: string; qty: number }>();

  const newQty = (existing?.qty ?? 0) + parsed.data.qty;
  if (newQty > stockAvail) {
    return fail(
      c,
      "stock_insufficient",
      `Stok hanya tersedia ${stockAvail} item. Silakan kurangi qty.`,
      409,
    );
  }

  if (existing) {
    await c.env.DB.prepare("UPDATE cart_items SET qty = ?, updated_at = ? WHERE id = ?")
      .bind(newQty, ts, existing.id)
      .run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO cart_items (id, cart_id, product_id, qty, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(nanoId("ci"), cartId, product.id, parsed.data.qty, ts, ts)
      .run();
  }
  return ok(c, await loadCartView(c));
});

const UpdateBody = z.object({
  itemId: z.string().min(1).max(64),
  qty: z.coerce.number().int().min(1).max(CART_QTY_MAX),
});

app.post("/update", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Input tidak valid.", 400);
  const user = c.get("user")!;
  const ts = now();
  const item = await c.env.DB.prepare(
    `SELECT ci.id, ci.product_id FROM cart_items ci
     JOIN carts c ON c.id = ci.cart_id
     WHERE ci.id = ? AND c.user_id = ?`,
  )
    .bind(parsed.data.itemId, user.id)
    .first<{ id: string; product_id: string }>();
  if (!item) return fail(c, "not_found", "Item tidak ditemukan.", 404);
  const stk = await c.env.DB.prepare(
    "SELECT COUNT(*) AS c FROM product_inventory_items WHERE product_id = ? AND status='available'",
  )
    .bind(item.product_id)
    .first<{ c: number }>();
  if ((stk?.c ?? 0) < parsed.data.qty) {
    return fail(c, "stock_insufficient", "Stok tidak mencukupi untuk qty tersebut.", 409);
  }
  await c.env.DB.prepare("UPDATE cart_items SET qty = ?, updated_at = ? WHERE id = ?")
    .bind(parsed.data.qty, ts, item.id)
    .run();
  return ok(c, await loadCartView(c));
});

app.post("/remove", async (c) => {
  const body = await c.req.json().catch(() => null);
  const itemId = body?.itemId;
  if (!itemId) return fail(c, "validation", "Item tidak valid.");
  const user = c.get("user")!;
  await c.env.DB.prepare(
    `DELETE FROM cart_items WHERE id = ? AND cart_id IN (SELECT id FROM carts WHERE user_id = ?)`,
  )
    .bind(itemId, user.id)
    .run();
  return ok(c, await loadCartView(c));
});

app.post("/clear", async (c) => {
  const user = c.get("user")!;
  await c.env.DB.prepare("DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = ?)")
    .bind(user.id)
    .run();
  return ok(c, await loadCartView(c));
});

export default app;
