import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/response";
import { now } from "../../lib/time";
import { audit } from "../../lib/audit";
import { creditWallet, expireOrderIfDue, markOrderPaid } from "../../services/order";
import { consumeAdminAck } from "./auth";
import { buildPage, parsePagination } from "../../lib/pagination";

const app = new Hono<AppContext>({ strict: false });

app.get("/", async (c) => {
  const status = c.req.query("status") ?? "";
  const where: string[] = [];
  const binds: any[] = [];
  if (status) {
    where.push("o.status = ?");
    binds.push(status);
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const p = parsePagination({ query: (k) => c.req.query(k) });

  const [rs, total] = await Promise.all([
    c.env.DB.prepare(
      `SELECT o.*, u.username FROM orders o
         JOIN users u ON u.id = o.user_id
       ${whereSql}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(...binds, p.pageSize, p.offset)
      .all<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS c FROM orders o ${whereSql}`)
      .bind(...binds)
      .first<{ c: number }>(),
  ]);

  // Self-heal expiry untuk daftar pending. Jika ada perubahan, fetch ulang sekali.
  let needsRefresh = false;
  for (const r of rs.results ?? []) {
    if (r.status === "pending_payment" && r.expires_at <= Math.floor(Date.now() / 1000)) {
      await expireOrderIfDue(c.env, r.id);
      needsRefresh = true;
    }
  }
  const fresh = needsRefresh
    ? await c.env.DB.prepare(
        `SELECT o.*, u.username FROM orders o
           JOIN users u ON u.id = o.user_id
         ${whereSql}
         ORDER BY o.created_at DESC
         LIMIT ? OFFSET ?`,
      )
        .bind(...binds, p.pageSize, p.offset)
        .all<any>()
    : rs;
  return ok(c, buildPage(fresh.results ?? [], total?.c ?? 0, p));
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  await expireOrderIfDue(c.env, id);
  const o = await c.env.DB.prepare(
    "SELECT o.*, u.username, u.email FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?",
  )
    .bind(id)
    .first<any>();
  if (!o) return fail(c, "not_found", "Order tidak ditemukan.", 404);
  const [items, payment, inv] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, product_id, product_name_snapshot, qty, unit_price_cents, subtotal_cents FROM order_items WHERE order_id = ?",
    )
      .bind(id)
      .all<any>(),
    c.env.DB.prepare("SELECT * FROM payments WHERE order_id = ?").bind(id).first<any>(),
    c.env.DB.prepare(
      `SELECT i.id, i.payload_email, i.payload_password, i.payload_note, i.payload_expiry, i.payload_extra, i.status,
              (SELECT name FROM products WHERE id = i.product_id) AS product_name
         FROM product_inventory_items i
        WHERE i.sold_to_order_id = ? OR i.reserved_for_order_id = ?
        ORDER BY i.status DESC, i.created_at`,
    )
      .bind(id, id)
      .all<any>(),
  ]);
  return ok(c, {
    id: o.id,
    code: o.code,
    status: o.status,
    paymentMethod: o.payment_method,
    username: o.username,
    email: o.email,
    subtotalCents: o.subtotal_cents,
    discountCents: o.discount_cents,
    serviceFeeCents: o.service_fee_cents,
    totalCents: o.total_cents,
    voucherCode: o.voucher_code,
    createdAt: o.created_at,
    expiresAt: o.expires_at,
    paidAt: o.paid_at,
    refundedAt: o.refunded_at ?? null,
    notes: o.notes,
    items: (items.results ?? []).map((i: any) => ({
      id: i.id,
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
        }
      : null,
    inventory: (inv.results ?? []).map((d: any) => ({
      id: d.id,
      productName: d.product_name,
      payloadEmail: d.payload_email,
      payloadPassword: d.payload_password,
      payloadNote: d.payload_note,
      payloadExpiry: d.payload_expiry,
      payloadExtra: d.payload_extra,
      status: d.status,
    })),
  });
});

const MarkPaidBody = z.object({ ack: z.string().min(1) });
app.post("/:id/mark-paid", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req.json().catch(() => null);
  const parsed = MarkPaidBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Konfirmasi diperlukan.");
  const okAck = await consumeAdminAck(c.env, admin.id, parsed.data.ack);
  if (!okAck) return fail(c, "ack_required", "Konfirmasi password admin diperlukan.", 403);
  const id = c.req.param("id");
  const o = await c.env.DB.prepare("SELECT id, status, payment_method FROM orders WHERE id = ?").bind(id).first<any>();
  if (!o) return fail(c, "not_found", "Order tidak ditemukan.", 404);
  if (o.status !== "pending_payment") return fail(c, "invalid_state", "Order tidak pending.");
  await markOrderPaid(c.env, id, { source: "manual_admin" });
  await audit(c.env, {
    actorKind: "admin",
    actorId: admin.id,
    action: "admin.order.mark_paid",
    targetKind: "order",
    targetId: id,
  });
  return ok(c, { ok: true });
});

const RefundBody = z.object({
  ack: z.string().min(1),
  reason: z.string().trim().max(300).optional(),
});
app.post("/:id/refund", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req.json().catch(() => null);
  const parsed = RefundBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Form tidak valid.");
  const okAck = await consumeAdminAck(c.env, admin.id, parsed.data.ack);
  if (!okAck) return fail(c, "ack_required", "Konfirmasi password admin diperlukan.", 403);
  const id = c.req.param("id");
  const o = await c.env.DB.prepare(
    "SELECT id, user_id, status, total_cents, kind FROM orders WHERE id = ?",
  )
    .bind(id)
    .first<{ id: string; user_id: string; status: string; total_cents: number; kind: string }>();
  if (!o) return fail(c, "not_found", "Order tidak ditemukan.", 404);
  if (o.kind === "topup") return fail(c, "not_refundable", "Top up saldo tidak bisa direfund.");
  if (o.status !== "paid") return fail(c, "invalid_state", "Hanya order paid yang bisa direfund.");
  const ts = now();
  // Atomik: status -> refunded
  const upd = await c.env.DB.prepare(
    "UPDATE orders SET status='refunded', refunded_at=?, updated_at=? WHERE id=? AND status='paid'",
  )
    .bind(ts, ts, id)
    .run();
  // @ts-ignore
  if (!upd.meta?.changes) return fail(c, "race", "Order sudah berubah status.");
  await creditWallet(c.env, o.user_id, o.total_cents, {
    kind: "refund",
    relatedOrderId: id,
    note: parsed.data.reason ?? "Refund disetujui admin",
  });
  await audit(c.env, {
    actorKind: "admin",
    actorId: admin.id,
    action: "admin.order.refund",
    targetKind: "order",
    targetId: id,
    meta: { amount: o.total_cents, reason: parsed.data.reason },
  });
  return ok(c, { ok: true });
});

const DeleteBody = z.object({ ack: z.string().min(1) });
app.delete("/:id", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req.json().catch(() => null);
  const parsed = DeleteBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Konfirmasi diperlukan.");
  const okAck = await consumeAdminAck(c.env, admin.id, parsed.data.ack);
  if (!okAck) return fail(c, "ack_required", "Konfirmasi password admin diperlukan.", 403);
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(id).run();
  await audit(c.env, {
    actorKind: "admin",
    actorId: admin.id,
    action: "admin.order.delete",
    targetKind: "order",
    targetId: id,
  });
  return ok(c, { ok: true });
});

// Hapus order > 1 bulan yang sudah final (paid/expired/refunded/cancelled)
app.post("/cleanup-old", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req.json().catch(() => ({} as any));
  const parsed = DeleteBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Konfirmasi diperlukan.");
  const okAck = await consumeAdminAck(c.env, admin.id, parsed.data.ack);
  if (!okAck) return fail(c, "ack_required", "Konfirmasi password admin diperlukan.", 403);
  const cutoff = now() - 30 * 24 * 3600;
  const r = await c.env.DB.prepare(
    "DELETE FROM orders WHERE status IN ('expired','cancelled','refunded') AND created_at < ?",
  )
    .bind(cutoff)
    .run();
  // @ts-ignore
  const removed = r.meta?.changes ?? 0;
  await audit(c.env, { actorKind: "admin", actorId: admin.id, action: "admin.order.cleanup_old", meta: { removed } });
  return ok(c, { removed });
});

export default app;
