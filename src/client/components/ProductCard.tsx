import { Link } from "react-router-dom";
import { Star, Clock, Package, TrendingUp } from "lucide-react";
import type { PublicProductSummary } from "@shared/types";
import { rupiah } from "../lib/format";
import { Thumbnail } from "./Thumbnail";
import { categoryIcon } from "../lib/category-icons";

/**
 * Product card "Aurora Noir":
 *   - image-first, border tipis 1px, radius lg, hover lift halus
 *   - harga pakai font mono (var(--font-ui)) tabular-nums
 *   - badge promo/ready/terlaris dengan tone aksen, tanpa shadow-stacking
 */
export function ProductCard({ p }: { p: PublicProductSummary }) {
  const promo = p.salePriceCents != null && p.salePriceCents < p.priceCents;
  const discountPct = promo
    ? Math.round(((p.priceCents - p.salePriceCents!) / p.priceCents) * 100)
    : 0;
  const CatIcon = categoryIcon(p.category);

  return (
    <Link
      to={`/p/${p.slug}`}
      className="group card-flat lift overflow-hidden flex flex-col"
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-[var(--color-surface-tint)]">
        <Thumbnail
          src={p.thumbnailUrl}
          alt={p.name}
          fallbackIcon={Package}
          fallbackSize={36}
          className="transition-transform duration-500 group-hover:scale-[1.06]"
        />

        {/* Badges top-left */}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
          {promo && <span className="badge-promo">−{discountPct}%</span>}
          {p.isReady && !promo && <span className="badge-ready">READY</span>}
          {p.salesCount > 50 && (
            <span className="badge-best">
              <TrendingUp size={11} /> LARIS
            </span>
          )}
        </div>

        {/* Out-of-stock overlay */}
        {!p.isReady && (
          <div className="absolute inset-0 bg-[var(--color-surface)]/80 backdrop-blur-[2px] grid place-items-center">
            <span className="status-pill border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-danger)]">
              Stok habis
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3.5 flex-1 flex flex-col gap-1.5">
        <div className="eyebrow inline-flex items-center gap-1.5">
          <CatIcon size={12} />
          {p.category?.name}
        </div>
        <div className="font-semibold text-[var(--color-ink)] line-clamp-2 text-[15px] leading-snug min-h-[2.6rem]">
          {p.name}
        </div>

        {p.durationLabel && (
          <div className="text-xs text-[var(--color-ink-2)] inline-flex items-center gap-1">
            <Clock size={12} />
            {p.durationLabel}
          </div>
        )}

        <div className="mt-auto pt-2.5 flex items-end justify-between gap-2 border-t border-[var(--color-border)]">
          <div className="min-w-0 pt-2.5">
            {promo ? (
              <>
                <div
                  className="font-bold text-[var(--color-brand-700)] text-[17px] leading-tight tabular-nums"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {rupiah(p.salePriceCents!)}
                </div>
                <div
                  className="text-[11px] text-[var(--color-ink-3)] line-through tabular-nums"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {rupiah(p.priceCents)}
                </div>
              </>
            ) : (
              <div
                className="font-bold text-[var(--color-ink)] text-[17px] tabular-nums"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {rupiah(p.priceCents)}
              </div>
            )}
          </div>
          <div className="text-right text-[11px] text-[var(--color-ink-2)] shrink-0 pt-2.5">
            <div className="inline-flex items-center gap-1 font-semibold">
              <Star size={11} className="fill-[var(--color-warning)] stroke-[var(--color-warning)]" />
              {p.ratingAvg.toFixed(1)}
              <span className="text-[var(--color-ink-3)] font-normal">({p.ratingCount})</span>
            </div>
            <div className="text-[var(--color-ink-3)]">
              {p.stock > 0 ? `${p.stock} stok` : "—"}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
