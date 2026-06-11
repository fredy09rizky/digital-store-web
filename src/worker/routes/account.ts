import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { fail, ok } from "../lib/response";
import { now } from "../lib/time";
import { nanoId } from "../lib/id";
import { pakasirProvider } from "../services/payment";
import { audit } from "../lib/audit";
import { rateLimit } from "../lib/rate-limit";
import { imageUrlSchema } from "../lib/validation";

const app = new Hono<AppContext>({ strict: false });

app.get("/me", async (c) => {
  const user = c.get("user")!;
  const u = await c.env.DB.prepare(
    "SELECT id, username, email, display_name, balance_cents, created_at FROM users WHERE id = ?",
  )
    .bind(user.id)
    .first<any>();
  if (!u) return fail(c, "not_found", "User tidak ditemukan.", 404);
  return ok(c, {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.display_name,
    balanceCents: u.balance_cents,
    createdAt: u.created_at,
  });
});

app.get("/wallet/transactions", async (c) => {
  const user = c.get("user")!;
  const rs = await c.env.DB.prepare(
    `SELECT id, kind, direction, amount_cents, balance_after_cents, related_order_id, note, created_at
       FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(user.id)
    .all<any>();
  return ok(c, rs.results ?? []);
});

const TopUpBody = z.object({
  amountCents: z.coerce.number().int().min(10_000).max(50_000_000),
});

// Top-up via QRIS (provider yang sama). Implementasi alur: buat "order pseudo" di tabel
// payments tanpa orders.
app.post("/wallet/topup", async (c) => {
  const user = c.get("user")!;
  const rl = await rateLimit(c.env, { key: `rl:topup:${user.id}`, windowSeconds: 60, max: 6 });
  if (!rl.allowed) return fail(c, "rate_limited", "Terlalu banyak permintaan. Coba lagi sebentar.", 429);
  const body = await c.req.json().catch(() => null);
  const parsed = TopUpBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Nominal tidak valid.");
  const amount = parsed.data.amountCents;

  // Batas saldo maksimal. Setting `max_wallet_balance_cents` (default 1jt,
  // 0 = tanpa batas). Top up tidak boleh membuat saldo melewati batas.
  // Maks top up sekali = batas - (saldo sekarang + total top up yang masih
  // pending). Pending ikut dihitung supaya user tidak bisa membuat banyak
  // order top up yang masing-masing muat tapi totalnya melebihi batas
  // (pembayaran QRIS bersifat asinkron).
  const capRow = await c.env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'max_wallet_balance_cents'",
  ).first<{ value: string }>();
  const cap = parseInt(capRow?.value ?? "1000000", 10);
  if (Number.isFinite(cap) && cap > 0) {
    const ts0 = now();
    const u = await c.env.DB.prepare("SELECT balance_cents FROM users WHERE id = ?")
      .bind(user.id)
      .first<{ balance_cents: number }>();
    const balance = u?.balance_cents ?? 0;
    const pend = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(total_cents), 0) AS c FROM orders
        WHERE user_id = ? AND status = 'pending_payment'
          AND notes = 'Top up saldo' AND expires_at > ?`,
    )
      .bind(user.id, ts0)
      .first<{ c: number }>();
    const pending = pend?.c ?? 0;
    const remaining = cap - balance - pending;
    if (remaining <= 0) {
      return fail(
        c,
        "balance_cap_reached",
        `Saldo kamu sudah mencapai batas maksimal Rp${cap.toLocaleString("id-ID")}${pending > 0 ? " (termasuk top up yang masih pending)" : ""}. Top up belum bisa dilakukan.`,
      );
    }
    if (amount > remaining) {
      return fail(
        c,
        "topup_exceeds_cap",
        `Maksimal top up saat ini Rp${remaining.toLocaleString("id-ID")} (batas saldo Rp${cap.toLocaleString("id-ID")}${pending > 0 ? `, ada Rp${pending.toLocaleString("id-ID")} top up pending` : ""}).`,
      );
    }
  }

  const ts = now();
  const orderId = nanoId("ord");
  const code = `TOP-${nanoId("", 8).toUpperCase()}`;
  const expiresAt = ts + parseInt(c.env.PAYMENT_EXPIRY_SECONDS, 10);

  // Top-up dimodelkan sebagai order khusus dengan total_cents = amount, items kosong.
  await c.env.DB.prepare(
    `INSERT INTO orders (id, code, user_id, status, payment_method, subtotal_cents, discount_cents, service_fee_cents, total_cents, expires_at, notes, created_at, updated_at)
     VALUES (?, ?, ?, 'pending_payment', 'qris', ?, 0, 0, ?, ?, 'Top up saldo', ?, ?)`,
  )
    .bind(orderId, code, user.id, amount, amount, expiresAt, ts, ts)
    .run();

  let cr;
  try {
    const provider = pakasirProvider(c.env);
    cr = await provider.create({
      orderId,
      orderCode: code,
      amountCents: amount,
      method: "qris",
      customer: { id: user.id, email: user.email, username: user.username },
      expiresInSeconds: parseInt(c.env.PAYMENT_EXPIRY_SECONDS, 10),
    });
  } catch (err: any) {
    // Rollback: hapus order top up yang baru saja dibuat
    await c.env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(orderId).run();
    return fail(c, "payment_provider_failed", err?.message ?? "Gagal membuat tagihan QRIS.", 502);
  }

  const raw = (cr.raw ?? {}) as { fee?: number; totalPayment?: number; expiresAt?: number };
  const feeCents = typeof raw.fee === "number" ? raw.fee : 0;
  const displayAmountCents = typeof raw.totalPayment === "number" ? raw.totalPayment : amount;
  const expiresAtProvider = typeof raw.expiresAt === "number" ? raw.expiresAt : null;

  await c.env.DB.prepare(
    `INSERT INTO payments (id, order_id, provider, method, amount_cents, status, external_id, qr_payload,
                           display_amount_cents, fee_cents, expires_at_provider, created_at, updated_at)
     VALUES (?, ?, ?, 'qris', ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      nanoId("pay"),
      orderId,
      cr.provider,
      amount,
      cr.externalId,
      cr.qrPayload,
      displayAmountCents,
      feeCents,
      expiresAtProvider,
      ts,
      ts,
    )
    .run();

  await audit(c.env, {
    actorKind: "user",
    actorId: user.id,
    action: "wallet.topup_initiated",
    targetKind: "order",
    targetId: orderId,
    meta: { amount },
  });

  return ok(c, { orderId, code });
});

// Refund request (user): user request pengembalian untuk order tertentu.
const RefundReqBody = z.object({
  orderId: z.string().min(1),
  reason: z.string().trim().min(5).max(500),
});

app.post("/refund-request", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => null);
  const parsed = RefundReqBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Form refund tidak lengkap.");
  const o = await c.env.DB.prepare(
    "SELECT id, status FROM orders WHERE id = ? AND user_id = ?",
  )
    .bind(parsed.data.orderId, user.id)
    .first<{ id: string; status: string }>();
  if (!o) return fail(c, "not_found", "Order tidak ditemukan.", 404);
  if (o.status !== "paid") return fail(c, "invalid_state", "Hanya order paid yang bisa direfund.");
  // Buka chat support untuk order bila belum ada, dan kirim pesan otomatis dari user.
  const ts = now();
  let chat = await c.env.DB.prepare("SELECT id, status FROM support_chats WHERE order_id = ?")
    .bind(o.id)
    .first<{ id: string; status: string }>();
  if (!chat) {
    const sid = nanoId("sc");
    await c.env.DB.prepare(
      "INSERT INTO support_chats (id, order_id, user_id, status, created_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?)",
    )
      .bind(sid, o.id, user.id, ts, ts)
      .run();
    chat = { id: sid, status: "open" };
  } else if (chat.status === "closed") {
    return fail(c, "chat_closed", "Sesi chat order ini sudah ditutup admin.");
  }
  await c.env.DB.prepare(
    "INSERT INTO support_messages (id, chat_id, sender_kind, body, created_at) VALUES (?, ?, 'user', ?, ?)",
  )
    .bind(nanoId("sm"), chat.id, `[REFUND REQUEST]\n${parsed.data.reason}`, ts)
    .run();
  await c.env.DB.prepare(
    "UPDATE support_chats SET unread_admin = unread_admin + 1, updated_at = ? WHERE id = ?",
  )
    .bind(ts, chat.id)
    .run();
  await audit(c.env, {
    actorKind: "user",
    actorId: user.id,
    action: "refund.requested",
    targetKind: "order",
    targetId: o.id,
    meta: { reason: parsed.data.reason },
  });
  return ok(c, { chatId: chat.id });
});

// Submit review (hanya pembeli sukses)
const ReviewBody = z.object({
  orderId: z.string().min(1),
  productId: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).default(""),
  imageUrls: z.array(imageUrlSchema).max(2).optional().default([]),
});

app.post("/reviews", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => null);
  const parsed = ReviewBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Form review tidak valid.");

  // Validasi: user benar-benar pembeli order yang paid dan produk ada di order.
  const eligible = await c.env.DB.prepare(
    `SELECT 1 FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = ? AND o.user_id = ? AND o.status = 'paid' AND oi.product_id = ?
      LIMIT 1`,
  )
    .bind(parsed.data.orderId, user.id, parsed.data.productId)
    .first<{ "1": number }>();
  if (!eligible) return fail(c, "not_eligible", "Hanya pembeli sukses yang bisa memberi review.", 403);

  const exists = await c.env.DB.prepare(
    "SELECT id FROM reviews WHERE order_id = ? AND product_id = ? AND user_id = ?",
  )
    .bind(parsed.data.orderId, parsed.data.productId, user.id)
    .first<{ id: string }>();
  if (exists) return fail(c, "duplicate", "Kamu sudah pernah review produk ini di order ini.", 409);

  const ts = now();
  const reviewId = nanoId("rv");
  await c.env.DB.prepare(
    `INSERT INTO reviews (id, product_id, order_id, user_id, rating, comment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(reviewId, parsed.data.productId, parsed.data.orderId, user.id, parsed.data.rating, parsed.data.comment, ts, ts)
    .run();
  for (let i = 0; i < parsed.data.imageUrls.length; i++) {
    await c.env.DB.prepare(
      "INSERT INTO review_images (id, review_id, url, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(nanoId("ri"), reviewId, parsed.data.imageUrls[i], i, ts)
      .run();
  }
  await audit(c.env, {
    actorKind: "user",
    actorId: user.id,
    action: "review.submitted",
    targetKind: "review",
    targetId: reviewId,
  });
  return ok(c, { id: reviewId });
});

export default app;
