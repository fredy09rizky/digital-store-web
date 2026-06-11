// Evaluasi voucher di backend.
//
// Aturan:
//   - 1 voucher per order.
//   - Tidak boleh digabung dengan harga spesial: jika SEMUA item kena harga spesial,
//     voucher ditolak. Jika sebagian saja, hanya item non-spesial yang berkontribusi
//     ke subtotal yang dihitung untuk voucher.
//   - Scope: all | category | product.
//   - Quota total dan per user dihormati.
//   - active_from <= now <= active_until dan is_active = 1.

import type { ProductPriceContext } from "./pricing";
import { hasSpecialPrice } from "./pricing";

export interface VoucherRow {
  id: string;
  code: string;
  discount_type: "percent" | "amount";
  discount_value: number;
  max_discount_cents: number | null;
  min_subtotal_cents: number;
  scope_type: "all" | "category" | "product";
  scope_ref_id: string | null;
  total_quota: number | null;
  per_user_quota: number;
  used_count: number;
  active_from: number;
  active_until: number;
  is_active: number;
}

export interface VoucherCartLine {
  productId: string;
  categoryId: string;
  qty: number;
  unitPriceCents: number;
  priceContext: ProductPriceContext;
}

export interface VoucherEvaluation {
  applicable: boolean;
  reason?: string;
  discountCents: number;
  eligibleSubtotalCents: number;
}

export function evaluateVoucher(
  voucher: VoucherRow,
  lines: VoucherCartLine[],
  ctx: { now: number; userUsage: number },
): VoucherEvaluation {
  if (!voucher.is_active) {
    return { applicable: false, reason: "Voucher tidak aktif.", discountCents: 0, eligibleSubtotalCents: 0 };
  }
  if (ctx.now < voucher.active_from) {
    return { applicable: false, reason: "Voucher belum berlaku.", discountCents: 0, eligibleSubtotalCents: 0 };
  }
  if (ctx.now > voucher.active_until) {
    return { applicable: false, reason: "Voucher sudah kedaluwarsa.", discountCents: 0, eligibleSubtotalCents: 0 };
  }
  if (voucher.total_quota != null && voucher.used_count >= voucher.total_quota) {
    return { applicable: false, reason: "Kuota voucher habis.", discountCents: 0, eligibleSubtotalCents: 0 };
  }
  if (ctx.userUsage >= voucher.per_user_quota) {
    return {
      applicable: false,
      reason: "Kamu sudah mencapai batas pemakaian voucher ini.",
      discountCents: 0,
      eligibleSubtotalCents: 0,
    };
  }

  // Pisahkan dua sebab penolakan supaya pesan ke user jelas:
  //   1. Item tidak masuk scope voucher (kategori/produk lain).
  //   2. Item masuk scope TAPI sedang memakai harga spesial (promo/tier),
  //      sehingga tidak boleh ditumpuk dengan voucher.
  const inScopeLines = lines.filter((l) => {
    if (voucher.scope_type === "product" && voucher.scope_ref_id !== l.productId) return false;
    if (voucher.scope_type === "category" && voucher.scope_ref_id !== l.categoryId) return false;
    return true;
  });

  if (inScopeLines.length === 0) {
    return {
      applicable: false,
      reason: "Voucher ini tidak berlaku untuk produk/kategori di keranjangmu.",
      discountCents: 0,
      eligibleSubtotalCents: 0,
    };
  }

  // Dari item yang masuk scope, buang yang sedang memakai harga spesial.
  const eligibleLines = inScopeLines.filter((l) => !hasSpecialPrice(l.priceContext));

  if (eligibleLines.length === 0) {
    return {
      applicable: false,
      reason:
        "Voucher tidak bisa digabung dengan harga promo/grosir. Semua item di keranjang sedang memakai harga spesial.",
      discountCents: 0,
      eligibleSubtotalCents: 0,
    };
  }

  const eligibleSubtotal = eligibleLines.reduce((s, l) => s + l.unitPriceCents * l.qty, 0);
  if (eligibleSubtotal < voucher.min_subtotal_cents) {
    return {
      applicable: false,
      reason: `Minimum subtotal Rp${voucher.min_subtotal_cents.toLocaleString("id-ID")} belum tercapai.`,
      discountCents: 0,
      eligibleSubtotalCents: eligibleSubtotal,
    };
  }

  let discount = 0;
  if (voucher.discount_type === "percent") {
    discount = Math.floor((eligibleSubtotal * voucher.discount_value) / 100);
    if (voucher.max_discount_cents != null) discount = Math.min(discount, voucher.max_discount_cents);
  } else {
    discount = voucher.discount_value;
  }
  // Diskon tidak boleh melebihi eligible subtotal.
  discount = Math.max(0, Math.min(discount, eligibleSubtotal));

  return { applicable: true, discountCents: discount, eligibleSubtotalCents: eligibleSubtotal };
}
