import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { fail, ok } from "../lib/response";
import { expireOrderIfDue, markOrderPaid } from "../services/order";
import { rateLimit } from "../lib/rate-limit";
import { now } from "../lib/time";
import { audit } from "../lib/audit";
import { nanoId } from "../lib/id";
import { loggerFor } from "../lib/log";
import { pakasirProvider } from "../services/payment";
import { imageUrlSchema } from "../lib/validation";

const app = new Hono<AppContext>({ strict: false });

app.get("/", async (c) => {
  const user = c.get("user")!;
  const status = c.req.query("status");
  // Top up (kind='topup') sengaja disembunyikan dari daftar pesanan — sudah
  // tercatat lengkap di Mutasi saldo. Order pseudo top up tetap ada di DB
  // untuk halaman pembayaran/sukses, tapi bukan "pesanan" dari sisi user.
  const where = ["o.user_id = ?", "o.kind != 'topup'"];
  const binds: any[] = [user.id];
  if (status) {
    where.push("o.status = ?");
    binds.push(status);
  }
  const sql = `SELECT o.id, o.code, o.status, o.total_cents, o.created_at, o.expires_at, o.paid_at,
                      o.payment_method,
                      (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
                 FROM orders o WHERE ${where.join(" AND ")} ORDER BY o.created_at DESC LIMIT 200`;

  const initial = await c.env.DB.prepare(sql).bind(...binds).all<any>();

  // Self-heal expiry untuk order pending. Jika ada yang berubah, fetch ulang sekali.
  let needsRefresh = false;
  for (const r of initial.results ?? []) {
    if (r.status === "pending_payment" && r.expires_at <= Math.floor(Date.now() / 1000)) {
      await expireOrderIfDue(c.env, r.id);
      needsRefresh = true;
    }
  }
  const fresh = needsRefresh
    ? await c.env.DB.prepare(sql).bind(...binds).all<any>()
    : initial;

  return ok(
    c,
    (fresh.results ?? []).map((r: any) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      totalCents: r.total_cents,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      paidAt: r.paid_at,
      paymentMethod: r.payment_method,
      itemCount: r.item_count,
    })),
  );
});

async function loadOrderDetail(env: AppContext["Bindings"], userId: string, idOrCode: string) {
  await expireOrderIfDueByCode(env, userId, idOrCode);
  const o = await env.DB.prepare(
    `SELECT * FROM orders WHERE user_id = ? AND (id = ? OR code = ?)`,
  )
    .bind(userId, idOrCode, idOrCode)
    .first<any>();
  if (!o) return null;

  // Jalankan query independen secara paralel untuk mengurangi latency.
  const [items, payment, delivered, reviewables, chat] = await Promise.all([
    env.DB.prepare(
      "SELECT id, product_id, product_name_snapshot, qty, unit_price_cents, subtotal_cents FROM order_items WHERE order_id = ?",
    )
      .bind(o.id)
      .all<any>(),
    env.DB.prepare("SELECT * FROM payments WHERE order_id = ?").bind(o.id).first<any>(),
    env.DB.prepare(
      `SELECT id, payload_email, payload_password, payload_note, payload_expiry, payload_extra,
              (SELECT name FROM products WHERE id = product_inventory_items.product_id) AS product_name
         FROM product_inventory_items
        WHERE sold_to_order_id = ?
        ORDER BY sold_at`,
    )
      .bind(o.id)
      .all<any>(),
    env.DB.prepare(
      `SELECT DISTINCT oi.product_id, oi.product_name_snapshot AS product_name,
              (SELECT 1 FROM reviews r WHERE r.order_id = ? AND r.product_id = oi.product_id AND r.user_id = ?) AS reviewed
         FROM order_items oi WHERE oi.order_id = ?`,
    )
      .bind(o.id, userId, o.id)
      .all<{ product_id: string; product_name: string; reviewed: number | null }>(),
    env.DB.prepare("SELECT id, status FROM support_chats WHERE order_id = ? AND kind = 'refund'")
      .bind(o.id)
      .first<{ id: string; status: string }>(),
  ]);

  return {
    id: o.id,
    code: o.code,
    status: o.status,
    kind: o.kind,
    paymentMethod: o.payment_method,
    subtotalCents: o.subtotal_cents,
    discountCents: o.discount_cents,
    serviceFeeCents: o.service_fee_cents,
    totalCents: o.total_cents,
    voucherCode: o.voucher_code,
    expiresAt: o.expires_at,
    paidAt: o.paid_at,
    createdAt: o.created_at,
    notes: o.notes,
    items: (items.results ?? []).map((i: any) => ({
      id: i.id,
      productId: i.product_id,
      productName: i.product_name_snapshot,
      qty: i.qty,
      unitPriceCents: i.unit_price_cents,
      subtotalCents: i.subtotal_cents,
    })),
    payment: payment
      ? {
          provider: payment.provider,
          method: payment.method,
          status: payment.status,
          qrPayload: payment.qr_payload,
          bankName: payment.bank_name,
          bankAccount: payment.bank_account,
          bankHolder: payment.bank_holder,
          proofUrl: payment.proof_url,
          displayAmountCents: payment.display_amount_cents ?? payment.amount_cents,
          feeCents: payment.fee_cents ?? 0,
          expiresAtProvider: payment.expires_at_provider ?? null,
        }
      : null,
    deliveredItems: (delivered.results ?? []).map((d: any) => ({
      id: d.id,
      productName: d.product_name,
      payloadEmail: d.payload_email,
      payloadPassword: d.payload_password,
      payloadNote: d.payload_note,
      payloadExpiry: d.payload_expiry,
      payloadExtra: d.payload_extra,
    })),
    refundChat: chat ? { id: chat.id, status: chat.status } : null,
    refundRequestedAt: o.refund_requested_at ?? null,
    reviewable: (reviewables.results ?? []).map((x) => ({
      productId: x.product_id,
      productName: x.product_name,
      reviewed: !!x.reviewed,
    })),
  };
}

async function expireOrderIfDueByCode(env: AppContext["Bindings"], userId: string, idOrCode: string) {
  const o = await env.DB.prepare("SELECT id FROM orders WHERE user_id = ? AND (id = ? OR code = ?)")
    .bind(userId, idOrCode, idOrCode)
    .first<{ id: string }>();
  if (o) await expireOrderIfDue(env, o.id);
}

app.get("/:idOrCode", async (c) => {
  const user = c.get("user")!;
  const detail = await loadOrderDetail(c.env, user.id, c.req.param("idOrCode"));
  if (!detail) return fail(c, "not_found", "Order tidak ditemukan.", 404);
  return ok(c, detail);
});

app.post("/:idOrCode/check-status", async (c) => {
  const user = c.get("user")!;
  const idOrCode = c.req.param("idOrCode");
  // Anti spam tombol cek manual & polling otomatis: 1 hit / 4 detik per
  // user-order. Window dibikin sedikit lebih kecil dari tier polling tercepat
  // di client (5s) supaya polling otomatis tidak pernah ter-throttle.
  const rl = await rateLimit(c.env, {
    key: `rl:checkstatus:${user.id}:${idOrCode}`,
    windowSeconds: 4,
    max: 1,
  });
  if (!rl.allowed) {
    const detail = await loadOrderDetail(c.env, user.id, idOrCode);
    if (!detail) return fail(c, "not_found", "Order tidak ditemukan.", 404);
    return ok(c, { order: detail, throttled: true });
  }
  await expireOrderIfDueByCode(c.env, user.id, idOrCode);

  const o = await c.env.DB.prepare(
    "SELECT id, status, expires_at, payment_method FROM orders WHERE user_id = ? AND (id = ? OR code = ?)",
  )
    .bind(user.id, idOrCode, idOrCode)
    .first<{ id: string; status: string; expires_at: number; payment_method: string }>();
  if (!o) return fail(c, "not_found", "Order tidak ditemukan.", 404);

  // Polling Pakasir hanya untuk metode QRIS. Bank transfer manual menunggu admin.
  if (o.status === "pending_payment" && o.payment_method === "qris") {
    const pay = await c.env.DB.prepare(
      "SELECT id, provider, external_id, amount_cents FROM payments WHERE order_id = ?",
    )
      .bind(o.id)
      .first<{ id: string; provider: string; external_id: string | null; amount_cents: number }>();
    if (pay) {
      try {
        const provider = pakasirProvider(c.env);
        const result = await provider
          .check(pay.external_id, idOrCode, pay.amount_cents)
          .catch(() => ({ status: "pending" as const, raw: undefined }));
        const ts = now();
        await c.env.DB.prepare(
          `INSERT INTO payment_attempts (id, payment_id, triggered_by, result, raw, created_at)
           VALUES (?, ?, 'user', ?, ?, ?)`,
        )
          .bind(nanoId("pa"), pay.id, result.status, JSON.stringify(result.raw ?? {}), ts)
          .run();
        if (result.status === "success") {
          await markOrderPaid(c.env, o.id, { source: "qris" });
        } else if (result.status === "expired") {
          await expireOrderIfDueByCode(c.env, user.id, idOrCode);
        }
      } catch (err) {
        // Provider error (mis. konfigurasi). Order tetap pending; user bisa retry.
        loggerFor(c).warn({
          event: "order.check_status.provider_error",
          msg: "Gagal memanggil Pakasir saat polling status.",
          err,
          meta: { orderId: o.id, idOrCode },
        });
      }
    }
  }
  const detail = await loadOrderDetail(c.env, user.id, idOrCode);
  return ok(c, { order: detail, throttled: false });
});

// Endpoint dev: simulasikan pembayaran sukses dengan memanggil API simulasi Pakasir.
// Hanya berfungsi saat APP_ENV !== "production" dan untuk method qris.
app.post("/:idOrCode/simulate-paid", async (c) => {
  if (c.env.APP_ENV === "production") return fail(c, "forbidden", "Tidak tersedia.", 403);
  const user = c.get("user")!;
  const o = await c.env.DB.prepare(
    "SELECT id, code, payment_method, status, total_cents FROM orders WHERE user_id = ? AND (id = ? OR code = ?)",
  )
    .bind(user.id, c.req.param("idOrCode"), c.req.param("idOrCode"))
    .first<{ id: string; code: string; payment_method: string; status: string; total_cents: number }>();
  if (!o) return fail(c, "not_found", "Order tidak ditemukan.", 404);
  if (o.status !== "pending_payment") return fail(c, "invalid_state", "Order sudah selesai/expired.");
  if (o.payment_method !== "qris") return fail(c, "invalid_method", "Hanya QRIS yang bisa disimulasikan.");

  try {
    const provider = pakasirProvider(c.env);
    const sim = await provider.simulatePayment(o.code, o.total_cents);
    if (!sim.ok) return fail(c, "simulate_failed", "Simulasi Pakasir gagal.", 502, sim.raw);
    // Setelah simulate sukses di Pakasir, polling status untuk markPaid.
    const result = await provider.check(o.code, o.code, o.total_cents);
    if (result.status === "success") {
      await markOrderPaid(c.env, o.id, { source: "qris" });
    }
  } catch (e: any) {
    return fail(c, "simulate_failed", e?.message ?? "Simulate failed.", 502);
  }

  await audit(c.env, {
    actorKind: "system",
    action: "order.simulate_paid",
    targetKind: "order",
    targetId: o.id,
  });
  const detail = await loadOrderDetail(c.env, user.id, o.id);
  return ok(c, detail);
});

const UploadProofBody = z.object({
  proofUrl: imageUrlSchema,
});
app.post("/:idOrCode/upload-proof", async (c) => {
  // Endpoint khusus untuk transfer manual: user submit URL bukti (sudah di-upload via /api/upload).
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => null);
  const parsed = UploadProofBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Bukti tidak valid.");
  const o = await c.env.DB.prepare(
    "SELECT id, payment_method, status FROM orders WHERE user_id = ? AND (id = ? OR code = ?)",
  )
    .bind(user.id, c.req.param("idOrCode"), c.req.param("idOrCode"))
    .first<{ id: string; payment_method: string; status: string }>();
  if (!o) return fail(c, "not_found", "Order tidak ditemukan.", 404);
  if (o.payment_method !== "bank_transfer")
    return fail(c, "invalid_method", "Bukti hanya untuk transfer manual.");
  if (o.status !== "pending_payment") return fail(c, "invalid_state", "Order sudah selesai/expired.");
  await c.env.DB.prepare("UPDATE payments SET proof_url = ?, updated_at = ? WHERE order_id = ?")
    .bind(parsed.data.proofUrl, now(), o.id)
    .run();
  return ok(c, { ok: true });
});

export default app;
