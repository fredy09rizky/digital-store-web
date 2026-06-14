/**
 * Service inti untuk membuat order, menyelesaikan pembayaran, dan menangani expiry.
 *
 * Pertimbangan utama:
 *   - Backend sumber kebenaran: harga, stok, voucher SEMUA dievaluasi ulang di sini.
 *     Apapun yang dikirim frontend untuk harga/diskon DIABAIKAN.
 *   - Race condition stok ditangani via inventory-reserve.tryReserveStock.
 *   - Idempotency saldo: pembayaran dompet hanya boleh dipotong sekali per order.
 *   - Expiry: order dengan status pending_payment dan expires_at <= now akan dianggap expired
 *     pada akses berikutnya, dan reservasi akan dilepas.
 */

import type { AppBindings } from "../env";
import { now } from "../lib/time";
import { nanoId, orderCode } from "../lib/id";
import {
  commitReservationForOrder,
  releaseReservationsForOrder,
  tryReserveStock,
} from "./inventory-reserve";
import { effectiveUnitPrice } from "./pricing";
import { loadPriceContext } from "./product-helpers";
import type { VoucherRow } from "./voucher";
import { evaluateVoucher } from "./voucher";
import { pakasirProvider } from "./payment";
import { audit } from "../lib/audit";

export interface CreateOrderRequest {
  userId: string;
  paymentMethod: "qris" | "bank_transfer" | "wallet";
  voucherCode?: string;
  notes?: string;
}

export interface CreateOrderResult {
  orderId: string;
  orderCode: string;
}

export class OrderError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface CartLineRow {
  cart_item_id: string;
  product_id: string;
  category_id: string;
  qty: number;
  product_name: string;
  product_status: string;
  price_cents: number;
  sale_price_cents: number | null;
}

export async function createOrderForUser(
  env: AppBindings,
  req: CreateOrderRequest,
): Promise<CreateOrderResult> {
  const userId = req.userId;
  const ts = now();

  // Validasi maintenance mode tetap dilakukan di middleware,
  // tapi guard di sini juga supaya aman dari panggilan internal.
  const maint = await env.DB.prepare("SELECT value FROM app_settings WHERE key='maintenance_mode'").first<{
    value: string;
  }>();
  if (maint?.value === "1") {
    throw new OrderError("maintenance", "Checkout sedang dalam pemeliharaan.", 503);
  }

  // 1) Ambil isi keranjang
  const cart = await env.DB.prepare("SELECT id FROM carts WHERE user_id = ?").bind(userId).first<{ id: string }>();
  if (!cart) {
    throw new OrderError("cart_empty", "Keranjang kamu kosong.");
  }
  const lines = await env.DB.prepare(
    `SELECT ci.id AS cart_item_id, ci.product_id, p.category_id, ci.qty,
            p.name AS product_name, p.status AS product_status,
            p.price_cents, p.sale_price_cents
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ?`,
  )
    .bind(cart.id)
    .all<CartLineRow>();
  const cartLines = lines.results ?? [];
  if (cartLines.length === 0) {
    throw new OrderError("cart_empty", "Keranjang kamu kosong.");
  }

  // 2) Hitung harga (backend = sumber kebenaran). Kumpulkan price context per produk.
  const priceContexts = new Map<string, Awaited<ReturnType<typeof loadPriceContext>>>();
  const evaluated: Array<{
    productId: string;
    categoryId: string;
    qty: number;
    productName: string;
    unitPriceCents: number;
    subtotalCents: number;
  }> = [];
  let subtotal = 0;
  for (const l of cartLines) {
    if (l.product_status !== "active") {
      throw new OrderError(
        "product_unavailable",
        `Produk "${l.product_name}" sedang tidak tersedia. Silakan hapus dari keranjang.`,
      );
    }
    const ctx = await loadPriceContext(env.DB, l.product_id);
    priceContexts.set(l.product_id, ctx);
    const unit = effectiveUnitPrice(ctx, l.qty);
    const sub = unit * l.qty;
    subtotal += sub;
    evaluated.push({
      productId: l.product_id,
      categoryId: l.category_id,
      qty: l.qty,
      productName: l.product_name,
      unitPriceCents: unit,
      subtotalCents: sub,
    });
  }

  // 3) Voucher (1 per order, tidak menumpuk dengan harga spesial).
  let discount = 0;
  let voucherRow: VoucherRow | null = null;
  if (req.voucherCode) {
    // Normalisasi: voucher selalu disimpan UPPERCASE oleh admin.
    // Frontend juga sudah uppercase, tapi backend WAJIB mencocokkan agar
    // request dari client lain (mobile/integrasi) tetap bekerja apa adanya.
    const code = req.voucherCode.trim().toUpperCase();
    const v = await env.DB.prepare(
      `SELECT id, code, discount_type, discount_value, max_discount_cents, min_subtotal_cents,
              scope_type, scope_ref_id, total_quota, per_user_quota, used_count,
              active_from, active_until, is_active
         FROM vouchers WHERE code = ?`,
    )
      .bind(code)
      .first<VoucherRow>();
    if (!v) throw new OrderError("voucher_invalid", "Kode voucher tidak ditemukan.");
    const userUsage = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM voucher_redemptions WHERE voucher_id = ? AND user_id = ?",
    )
      .bind(v.id, userId)
      .first<{ c: number }>();
    const evalRes = evaluateVoucher(
      v,
      cartLines.map((l) => ({
        productId: l.product_id,
        categoryId: l.category_id,
        qty: l.qty,
        unitPriceCents: priceContexts.get(l.product_id)
          ? effectiveUnitPrice(priceContexts.get(l.product_id)!, l.qty)
          : l.price_cents,
        priceContext: priceContexts.get(l.product_id)!,
      })),
      { now: ts, userUsage: userUsage?.c ?? 0 },
    );
    if (!evalRes.applicable) {
      throw new OrderError("voucher_not_applicable", evalRes.reason ?? "Voucher tidak bisa dipakai.");
    }
    discount = evalRes.discountCents;
    voucherRow = v;
  }

  // 4) Service fee (sederhana: dari setting)
  const feeRow = await env.DB.prepare("SELECT value FROM app_settings WHERE key='service_fee_cents'").first<{
    value: string;
  }>();
  const serviceFee = parseInt(feeRow?.value ?? "0", 10) || 0;

  let total = subtotal - discount + serviceFee;
  if (total < 0) total = 0;

  // 5) Cek saldo bila bayar pakai wallet
  if (req.paymentMethod === "wallet") {
    const u = await env.DB.prepare("SELECT balance_cents FROM users WHERE id = ?").bind(userId).first<{
      balance_cents: number;
    }>();
    if (!u || u.balance_cents < total) {
      throw new OrderError("insufficient_balance", "Saldo kamu tidak cukup untuk pesanan ini.");
    }
  }

  // 6) Buat order shell
  const orderId = nanoId("ord");
  const code = orderCode();
  const expiresAt = ts + parseInt(env.PAYMENT_EXPIRY_SECONDS, 10);
  await env.DB.prepare(
    `INSERT INTO orders (id, code, user_id, status, payment_method, subtotal_cents, discount_cents,
                         service_fee_cents, total_cents, voucher_id, voucher_code, expires_at,
                         notes, created_at, updated_at)
     VALUES (?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      orderId,
      code,
      userId,
      req.paymentMethod,
      subtotal,
      discount,
      serviceFee,
      total,
      voucherRow?.id ?? null,
      voucherRow?.code ?? null,
      expiresAt,
      req.notes ?? null,
      ts,
      ts,
    )
    .run();

  // 7) Insert order_items
  for (const e of evaluated) {
    await env.DB.prepare(
      `INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, unit_price_cents, qty, subtotal_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(nanoId("oi"), orderId, e.productId, e.productName, e.unitPriceCents, e.qty, e.subtotalCents, ts)
      .run();
  }

  // 8) Reservasi stok per produk (race-condition safe)
  try {
    for (const e of evaluated) {
      const r = await tryReserveStock(env.DB, e.productId, e.qty, orderId);
      if (!r.success) {
        // Rollback semua reservasi parsial dan hapus order
        await releaseReservationsForOrder(env.DB, orderId);
        await env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(orderId).run();
        throw new OrderError(
          "stock_unavailable",
          `Stok ${e.productName} sudah tidak cukup. Silakan kurangi qty atau pilih produk lain.`,
          409,
          { productId: e.productId, requested: e.qty, reserved: r.reserved },
        );
      }
    }
  } catch (err) {
    if (err instanceof OrderError) throw err;
    await releaseReservationsForOrder(env.DB, orderId);
    await env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(orderId).run();
    throw new OrderError("internal", "Gagal melakukan reservasi stok.", 500);
  }

  // 9) Buat payment record
  const paymentId = nanoId("pay");
  let qrPayload: string | null = null;
  let bankInfo: { name: string; account: string; holder: string } | null = null;
  let providerName: string;
  let externalId: string | null = code;
  let feeCents = 0;
  let displayAmountCents = total;
  let expiresAtProvider: number | null = null;

  if (req.paymentMethod === "wallet") {
    qrPayload = null;
    providerName = "wallet";
  } else if (req.paymentMethod === "qris") {
    // QRIS WAJIB lewat Pakasir.
    const u = await env.DB.prepare("SELECT id, email, username FROM users WHERE id = ?").bind(userId).first<{
      id: string;
      email: string;
      username: string;
    }>();
    try {
      const provider = pakasirProvider(env);
      const created = await provider.create({
        orderId,
        orderCode: code,
        amountCents: total,
        method: "qris",
        customer: { id: u!.id, email: u!.email, username: u!.username },
        expiresInSeconds: parseInt(env.PAYMENT_EXPIRY_SECONDS, 10),
      });
      qrPayload = created.qrPayload;
      providerName = created.provider;
      externalId = created.externalId;
      const raw = (created.raw ?? {}) as { fee?: number; totalPayment?: number; expiresAt?: number };
      if (typeof raw.fee === "number") feeCents = raw.fee;
      if (typeof raw.totalPayment === "number") displayAmountCents = raw.totalPayment;
      if (typeof raw.expiresAt === "number") expiresAtProvider = raw.expiresAt;
    } catch (err: any) {
      // Rollback reservasi & order kalau gagal call Pakasir.
      await releaseReservationsForOrder(env.DB, orderId);
      await env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(orderId).run();
      const code = err?.code === "pakasir_not_configured" ? "pakasir_not_configured" : "payment_provider_failed";
      throw new OrderError(code, `Gagal membuat tagihan QRIS: ${err?.message ?? "unknown"}`, 502);
    }
  } else if (req.paymentMethod === "bank_transfer") {
    // Transfer bank manual: ambil info rekening dari app_settings.
    const settings = await env.DB.prepare(
      "SELECT key, value FROM app_settings WHERE key IN ('manual_bank_enabled','manual_bank_name','manual_bank_account','manual_bank_holder')",
    ).all<{ key: string; value: string }>();
    const map = new Map((settings.results ?? []).map((r) => [r.key, r.value]));
    const enabled = map.get("manual_bank_enabled") === "1";
    const bankName = map.get("manual_bank_name");
    const bankAccount = map.get("manual_bank_account");
    const bankHolder = map.get("manual_bank_holder");
    if (!enabled || !bankName || !bankAccount || !bankHolder) {
      await releaseReservationsForOrder(env.DB, orderId);
      await env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(orderId).run();
      throw new OrderError(
        "bank_not_configured",
        "Metode transfer bank manual sedang tidak tersedia.",
        503,
      );
    }
    bankInfo = { name: bankName, account: bankAccount, holder: bankHolder };
    providerName = "manual_bank";
  } else {
    throw new OrderError("invalid_method", "Metode pembayaran tidak didukung.");
  }

  await env.DB.prepare(
    `INSERT INTO payments (id, order_id, provider, method, amount_cents, status, external_id,
                           qr_payload, bank_name, bank_account, bank_holder,
                           display_amount_cents, fee_cents, expires_at_provider,
                           created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      paymentId,
      orderId,
      providerName,
      req.paymentMethod,
      total,
      "pending",
      externalId,
      qrPayload,
      bankInfo?.name ?? null,
      bankInfo?.account ?? null,
      bankInfo?.holder ?? null,
      displayAmountCents,
      feeCents,
      expiresAtProvider,
      ts,
      ts,
    )
    .run();

  // 10) Bersihkan keranjang
  await env.DB.prepare("DELETE FROM cart_items WHERE cart_id = ?").bind(cart.id).run();

  // 11) Audit
  await audit(env, {
    actorKind: "user",
    actorId: userId,
    action: "order.created",
    targetKind: "order",
    targetId: orderId,
    meta: { code, total, paymentMethod: req.paymentMethod },
  });

  // 12) Kalau wallet, langsung settle
  if (req.paymentMethod === "wallet") {
    await markOrderPaid(env, orderId, { source: "wallet", note: `Bayar dari saldo (${code})` });
  }

  return { orderId, orderCode: code };
}

/**
 * Tandai order sebagai paid. Idempotent: jika sudah paid, tidak melakukan apa-apa.
 *
 * Strategi anti race:
 *   - UPDATE bersyarat pada status='pending_payment' yang akan menggagalkan
 *     panggilan paralel kedua karena status sudah berubah.
 *   - Konfirmasi via SELECT sebelum melakukan langkah berikutnya.
 */
export async function markOrderPaid(
  env: AppBindings,
  orderId: string,
  ctx: { source: "wallet" | "qris" | "bank_transfer" | "manual_admin"; note?: string },
): Promise<{ alreadyPaid: boolean }> {
  const ts = now();

  // Ambil order saat ini
  const current = await env.DB.prepare(
    "SELECT id, user_id, status, total_cents, payment_method, voucher_id, kind FROM orders WHERE id = ?",
  )
    .bind(orderId)
    .first<{
      id: string;
      user_id: string;
      status: string;
      total_cents: number;
      payment_method: string;
      voucher_id: string | null;
      kind: string;
    }>();
  if (!current) throw new OrderError("not_found", "Order tidak ditemukan.", 404);
  if (current.status === "paid") return { alreadyPaid: true };
  if (current.status !== "pending_payment") {
    throw new OrderError("invalid_state", "Order tidak dalam status menunggu pembayaran.");
  }

  // Update status secara conditional. Ini adalah titik serialisasi utama.
  const upd = await env.DB.prepare(
    "UPDATE orders SET status='paid', paid_at=?, updated_at=? WHERE id=? AND status='pending_payment'",
  )
    .bind(ts, ts, orderId)
    .run();
  // @ts-ignore meta exists
  const changes = upd.meta?.changes ?? upd.meta?.changed_db ?? upd.meta?.rows_written ?? 0;
  if (!changes) {
    // Status sudah dipindah pihak lain. Cek ulang untuk idempotency.
    const re = await env.DB.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first<{ status: string }>();
    if (re?.status === "paid") return { alreadyPaid: true };
    throw new OrderError("invalid_state", "Order tidak bisa diselesaikan.");
  }

  // Potong saldo jika source=wallet (idempotent karena hanya jalan saat update sukses).
  if (ctx.source === "wallet") {
    await debitWallet(env, current.user_id, current.total_cents, {
      relatedOrderId: orderId,
      note: ctx.note ?? `Pembayaran order`,
    });
  }

  // Commit reservasi stok -> sold + tingkatkan sales_count agregat per produk.
  await commitReservationForOrder(env.DB, orderId);

  const items = await env.DB.prepare(
    "SELECT product_id, qty FROM order_items WHERE order_id = ?",
  )
    .bind(orderId)
    .all<{ product_id: string; qty: number }>();
  for (const it of items.results ?? []) {
    await env.DB.prepare(
      "UPDATE products SET sales_count = sales_count + ?, updated_at = ? WHERE id = ?",
    )
      .bind(it.qty, ts, it.product_id)
      .run();
  }

  // Update payment status
  await env.DB.prepare(
    "UPDATE payments SET status='success', updated_at=? WHERE order_id=?",
  )
    .bind(ts, orderId)
    .run();

  // Top-up saldo: order khusus tanpa order_items dengan kind='topup'.
  // Karena CAS di atas memastikan branch ini hanya jalan SEKALI per order,
  // kredit saldo aman dari double-credit (tidak idempotent berulang).
  const isTopup = current.kind === "topup";
  if (isTopup) {
    await creditWallet(env, current.user_id, current.total_cents, {
      kind: "topup",
      relatedOrderId: orderId,
      note: "Top up saldo via QRIS",
    });
    await audit(env, {
      actorKind: "system",
      action: "wallet.topup_completed",
      targetKind: "order",
      targetId: orderId,
      meta: { amount: current.total_cents },
    });
  }

  // Catat redemption voucher
  if (current.voucher_id) {
    const ord = await env.DB.prepare(
      "SELECT discount_cents FROM orders WHERE id = ?",
    )
      .bind(orderId)
      .first<{ discount_cents: number }>();
    if (ord && ord.discount_cents > 0) {
      // OR IGNORE supaya tidak duplikat saat retry
      await env.DB.prepare(
        `INSERT OR IGNORE INTO voucher_redemptions (id, voucher_id, user_id, order_id, discount_cents, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(nanoId("vr"), current.voucher_id, current.user_id, orderId, ord.discount_cents, ts)
        .run();
      await env.DB.prepare(
        "UPDATE vouchers SET used_count = used_count + 1, updated_at=? WHERE id=?",
      )
        .bind(ts, current.voucher_id)
        .run();
    }
  }

  // Catatan: chat support TIDAK lagi dibuat otomatis saat order paid. Ruang
  // chat hanya dibuat saat user benar-benar membutuhkannya (klik "Ajukan
  // refund" untuk chat refund per-order, atau membuka Bantuan untuk chat
  // support umum di level akun).

  await audit(env, {
    actorKind: ctx.source === "manual_admin" ? "admin" : "system",
    action: "order.paid",
    targetKind: "order",
    targetId: orderId,
    meta: { source: ctx.source },
  });

  return { alreadyPaid: false };
}

/**
 * Tandai order expired bila sudah lewat waktu. Idempotent.
 * Dipanggil setiap kali order pending dibaca, sehingga "self-healing".
 */
export async function expireOrderIfDue(env: AppBindings, orderId: string) {
  const ts = now();
  const row = await env.DB.prepare(
    "SELECT id, status, expires_at FROM orders WHERE id = ?",
  )
    .bind(orderId)
    .first<{ id: string; status: string; expires_at: number }>();
  if (!row) return;
  if (row.status !== "pending_payment") return;
  if (row.expires_at > ts) return;

  const upd = await env.DB.prepare(
    "UPDATE orders SET status='expired', expired_at=?, updated_at=? WHERE id=? AND status='pending_payment'",
  )
    .bind(ts, ts, orderId)
    .run();
  // @ts-ignore meta exists
  const changes = upd.meta?.changes ?? 0;
  if (!changes) return;
  await releaseReservationsForOrder(env.DB, orderId);
  await env.DB.prepare(
    "UPDATE payments SET status='expired', updated_at=? WHERE order_id=? AND status='pending'",
  )
    .bind(ts, orderId)
    .run();
  await audit(env, {
    actorKind: "system",
    action: "order.expired",
    targetKind: "order",
    targetId: orderId,
  });
}

export async function expireAllDueOrders(env: AppBindings) {
  const ts = now();
  const rows = await env.DB.prepare(
    "SELECT id FROM orders WHERE status='pending_payment' AND expires_at <= ?",
  )
    .bind(ts)
    .all<{ id: string }>();
  for (const r of rows.results ?? []) await expireOrderIfDue(env, r.id);
}

/**
 * Debit saldo: aman dari race dengan UPDATE conditional balance >= amount.
 * Memakai `RETURNING balance_cents` agar `balance_after_cents` yang dicatat
 * di `wallet_transactions` benar-benar sinkron dengan baris yang baru saja
 * dimutasi (tidak ada gap untuk mutasi paralel pada user yang sama).
 */
export async function debitWallet(
  env: AppBindings,
  userId: string,
  amountCents: number,
  ctx: { relatedOrderId?: string; relatedPaymentId?: string; note?: string },
) {
  if (amountCents < 0) throw new OrderError("invalid_amount", "Jumlah tidak valid.");
  if (amountCents === 0) return;
  const ts = now();
  const updated = await env.DB.prepare(
    `UPDATE users
        SET balance_cents = balance_cents - ?, updated_at = ?
      WHERE id = ? AND balance_cents >= ?
      RETURNING balance_cents`,
  )
    .bind(amountCents, ts, userId, amountCents)
    .first<{ balance_cents: number }>();
  if (!updated) throw new OrderError("insufficient_balance", "Saldo tidak cukup.");
  await env.DB.prepare(
    `INSERT INTO wallet_transactions (id, user_id, kind, direction, amount_cents, balance_after_cents,
                                      related_order_id, related_payment_id, note, created_at)
     VALUES (?, ?, 'order_payment', 'debit', ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      nanoId("wt"),
      userId,
      amountCents,
      updated.balance_cents,
      ctx.relatedOrderId ?? null,
      ctx.relatedPaymentId ?? null,
      ctx.note ?? null,
      ts,
    )
    .run();
}

export async function creditWallet(
  env: AppBindings,
  userId: string,
  amountCents: number,
  ctx: {
    kind: "topup" | "refund" | "adjustment" | "reversal";
    relatedOrderId?: string;
    relatedPaymentId?: string;
    note?: string;
  },
) {
  if (amountCents <= 0) return;
  const ts = now();
  // RETURNING menjamin balance_after_cents berasal dari row yang baru saja
  // di-UPDATE, bukan dari SELECT terpisah yang bisa tergeser oleh mutasi
  // paralel.
  const updated = await env.DB.prepare(
    `UPDATE users
        SET balance_cents = balance_cents + ?, updated_at = ?
      WHERE id = ?
      RETURNING balance_cents`,
  )
    .bind(amountCents, ts, userId)
    .first<{ balance_cents: number }>();
  if (!updated) return;
  await env.DB.prepare(
    `INSERT INTO wallet_transactions (id, user_id, kind, direction, amount_cents, balance_after_cents,
                                      related_order_id, related_payment_id, note, created_at)
     VALUES (?, ?, ?, 'credit', ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      nanoId("wt"),
      userId,
      ctx.kind,
      amountCents,
      updated.balance_cents,
      ctx.relatedOrderId ?? null,
      ctx.relatedPaymentId ?? null,
      ctx.note ?? null,
      ts,
    )
    .run();
}
