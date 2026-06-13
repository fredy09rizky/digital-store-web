import type { ProductPriceContext, PriceTierRow } from "./pricing";

export interface ProductRow {
  id: string;
  sku: string;
  category_id: string;
  name: string;
  slug: string;
  description: string;
  thumbnail_url: string | null;
  price_cents: number;
  sale_price_cents: number | null;
  duration_label: string | null;
  warranty_note: string | null;
  status: string;
  is_featured: number;
  sales_count: number;
  rating_sum: number;
  rating_count: number;
  created_at: number;
  updated_at: number;
  category_slug?: string;
  category_name?: string;
  available_stock?: number;
}

export async function loadPriceContext(db: D1Database, productId: string): Promise<ProductPriceContext> {
  const product = await db
    .prepare("SELECT price_cents, sale_price_cents FROM products WHERE id = ?")
    .bind(productId)
    .first<{ price_cents: number; sale_price_cents: number | null }>();
  if (!product) {
    return { priceCents: 0, salePriceCents: null, tiers: [] };
  }
  const tiers = await db
    .prepare("SELECT min_qty, unit_price_cents FROM product_price_tiers WHERE product_id = ? ORDER BY min_qty")
    .bind(productId)
    .all<PriceTierRow>();
  return {
    priceCents: product.price_cents,
    salePriceCents: product.sale_price_cents,
    tiers: tiers.results ?? [],
  };
}

export function safeJsonArray(input: string | null | undefined): string[] {
  if (!input) return [];
  try {
    const v = JSON.parse(input);
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
    return [];
  } catch {
    return [];
  }
}

export function ratingAvg(sum: number, count: number): number {
  if (!count) return 0;
  return Math.round((sum / count) * 10) / 10;
}
