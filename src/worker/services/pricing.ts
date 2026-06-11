// Pricing helper. Backend = sumber kebenaran, frontend hanya menampilkan.

export interface PriceTierRow {
  min_qty: number;
  unit_price_cents: number;
}

export interface ProductPriceContext {
  priceCents: number;
  salePriceCents: number | null;
  tiers: PriceTierRow[];
}

/**
 * Hitung unit price berlaku untuk qty tertentu.
 * Aturan:
 *   - Sale price (jika ada) menggantikan harga normal.
 *   - Tier dievaluasi pada qty saat itu, ambil tier dengan min_qty terbesar yang <= qty.
 *   - Voucher TIDAK digabungkan dengan harga spesial. Itu diatur di voucher service.
 *   - Tier menang atas sale price untuk qty yang memenuhi tier (anggap tier sudah promo bertingkat).
 */
export function effectiveUnitPrice(ctx: ProductPriceContext, qty: number): number {
  const base = ctx.salePriceCents ?? ctx.priceCents;
  if (!ctx.tiers.length) return base;
  const sorted = [...ctx.tiers].sort((a, b) => a.min_qty - b.min_qty);
  let chosen: number | null = null;
  for (const t of sorted) {
    if (qty >= t.min_qty) chosen = t.unit_price_cents;
  }
  if (chosen == null) return base;
  // Jangan biarkan tier lebih mahal dari base.
  return Math.min(chosen, base);
}

/**
 * Apakah produk memiliki harga spesial yang membuat voucher tidak boleh apply.
 * Aturan: jika sale price aktif ATAU ada tier yang lebih murah dari priceCents.
 */
export function hasSpecialPrice(ctx: ProductPriceContext): boolean {
  if (ctx.salePriceCents != null && ctx.salePriceCents < ctx.priceCents) return true;
  for (const t of ctx.tiers) {
    if (t.unit_price_cents < ctx.priceCents) return true;
  }
  return false;
}
