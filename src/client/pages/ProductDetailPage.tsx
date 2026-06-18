import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Star,
  Clock,
  ShieldCheck,
  ShoppingCart,
  Zap,
  Package,
  Plus,
  Minus,
  Tag,
  TrendingUp,
  Layers,
  Image as ImageIcon,
  PackageCheck,
} from "lucide-react";
import { api } from "../lib/api";
import type { PublicProductDetail } from "@shared/types";
import { rupiah, dateID } from "../lib/format";
import { useApp } from "../state/AppProviders";
import { useToast } from "../components/Toast";
import { Button, IconButton, LinkButton } from "../components/Button";
import { Empty } from "../components/Empty";
import { Pagination } from "../components/Pagination";

interface ReviewRow {
  id: string;
  rating: number;
  comment: string;
  username: string;
  createdAt: number;
}
interface ReviewPage {
  items: ReviewRow[];
  page: number;
  pageSize: number;
  total: number;
}
const REVIEW_PAGE_SIZE = 5;

export default function ProductDetailPage() {
  const { slug } = useParams();
  const [p, setP] = useState<PublicProductDetail | null>(null);
  const [activeImg, setActiveImg] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<ReviewPage | null>(null);
  const [reviewPage, setReviewPage] = useState(1);
  const { boot, refreshCart } = useApp();
  const toast = useToast();
  const nav = useNavigate();

  useEffect(() => {
    setLoading(true);
    api<PublicProductDetail>(`/products/${slug}`)
      .then((d) => {
        setP(d);
        setActiveImg(d.thumbnailUrl ?? d.images[0]?.url ?? null);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [slug]);

  // Reset ke halaman 1 saat ganti produk.
  useEffect(() => {
    setReviewPage(1);
  }, [slug]);

  // Muat review berpaginasi (terpisah dari detail agar produk dengan ratusan
  // review tetap ringan).
  useEffect(() => {
    setReviews(null);
    api<ReviewPage>(`/products/${slug}/reviews?page=${reviewPage}&page_size=${REVIEW_PAGE_SIZE}`)
      .then(setReviews)
      .catch(() => setReviews(null));
  }, [slug, reviewPage]);

  if (loading) return <ProductDetailSkeleton />;
  if (!p)
    return (
      <Empty
        icon={Package}
        title="Produk tidak ditemukan"
        hint="Mungkin sudah dihapus atau tidak aktif lagi."
        action={
          <LinkButton to="/katalog" icon={Package}>
            Lihat katalog
          </LinkButton>
        }
      />
    );

  const promo = p.salePriceCents != null && p.salePriceCents < p.priceCents;
  const discountPct = promo
    ? Math.round(((p.priceCents - p.salePriceCents!) / p.priceCents) * 100)
    : 0;

  async function addToCart() {
    if (!boot?.user) {
      const next = encodeURIComponent(`/p/${slug}`);
      return nav(`/login?next=${next}`);
    }
    try {
      await api(`/cart/add`, { body: { productId: p!.id, qty } });
      refreshCart();
      toast.success("Ditambahkan ke keranjang.");
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal menambah ke keranjang.");
    }
  }
  async function buyNow() {
    if (!boot?.user) {
      const next = encodeURIComponent(`/p/${slug}`);
      return nav(`/login?next=${next}`);
    }
    try {
      await api(`/cart/clear`, { body: {} });
      await api(`/cart/add`, { body: { productId: p!.id, qty } });
      refreshCart();
      nav("/checkout");
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal melanjutkan.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-[var(--color-ink-2)] flex items-center gap-1.5">
        <Link to="/" className="hover:text-[var(--color-brand-700)] inline-flex items-center gap-1 font-semibold">
          <ArrowLeft size={12} /> Beranda
        </Link>
        <span aria-hidden>·</span>
        <Link
          to={`/katalog?category=${p.category?.slug ?? ""}`}
          className="hover:text-[var(--color-brand-700)] font-semibold"
        >
          {p.category?.name}
        </Link>
      </div>

      <div className="grid lg:grid-cols-[1.05fr_1fr] gap-5 lg:gap-7">
        {/* Image gallery + description */}
        <div className="space-y-3 min-w-0">
          <div className="card overflow-hidden">
            <div className="relative aspect-[4/3] bg-gradient-to-br from-[var(--color-surface-tint)] to-[var(--color-surface-soft)]">
              {activeImg ? (
                <>
                  {/* Backdrop blur dari gambar yang sama untuk mengisi ruang
                      kosong saat rasio gambar bukan 4:3, sehingga gambar utama
                      (object-contain) tetap utuh tanpa terpotong. */}
                  <img
                    src={activeImg}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 size-full object-cover blur-2xl scale-110 opacity-40"
                  />
                  <img
                    src={activeImg}
                    alt={p.name}
                    loading="eager"
                    decoding="async"
                    className="relative size-full object-contain"
                  />
                </>
              ) : (
                <div className="size-full grid place-items-center text-[var(--color-brand-300)]">
                  <ImageIcon size={48} />
                </div>
              )}
              {promo && (
                <span className="absolute top-3 left-3 badge-promo text-sm !px-3 !py-1.5">
                  HEMAT {discountPct}%
                </span>
              )}
              {!p.isReady && (
                <div className="absolute inset-0 bg-[var(--color-surface)]/85 backdrop-blur-[1px] grid place-items-center">
                  <span className="rounded-md bg-[var(--color-danger)] text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5">
                    Stok habis
                  </span>
                </div>
              )}
            </div>
          </div>

          {p.images.length > 0 && (
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
              {[
                ...(p.thumbnailUrl ? [{ id: "thumb", url: p.thumbnailUrl }] : []),
                ...p.images,
              ].map((im, idx) => (
                <button
                  key={im.id}
                  type="button"
                  onClick={() => setActiveImg(im.url)}
                  aria-label={`Lihat gambar ${idx + 1}`}
                  aria-pressed={activeImg === im.url}
                  className={
                    "aspect-square rounded-lg overflow-hidden border-2 transition " +
                    (activeImg === im.url
                      ? "border-[var(--color-brand-500)]"
                      : "border-[var(--color-border)] hover:border-[var(--color-brand-300)]")
                  }
                >
                  <img
                    src={im.url}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          <div className="card p-4 sm:p-5">
            <div className="font-bold text-[var(--color-ink)] mb-2 inline-flex items-center gap-2">
              <Layers size={15} className="text-[var(--color-brand-700)]" />
              Deskripsi
            </div>
            <div className="text-sm text-[var(--color-ink-2)] whitespace-pre-line leading-relaxed">
              {p.description || "—"}
            </div>
          </div>

          {p.warrantyNote && (
            <div className="card p-4 sm:p-5 bg-[var(--color-surface-tint)] border-[var(--color-brand-200)]">
              <div className="font-bold text-[var(--color-ink)] mb-1 inline-flex items-center gap-2">
                <ShieldCheck size={15} className="text-[var(--color-brand-700)]" />
                Garansi & catatan
              </div>
              <div className="text-sm text-[var(--color-ink)] whitespace-pre-line leading-relaxed">
                {p.warrantyNote}
              </div>
            </div>
          )}
        </div>

        {/* Buy box */}
        <div className="space-y-3 min-w-0">
          <div className="card p-5 sm:p-6 lg:sticky lg:top-20">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-700)]">
              {p.category?.name}
            </div>
            <h1
              className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)] mt-1 leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {p.name}
            </h1>
            <div className="text-xs text-[var(--color-ink-3)] mt-1">SKU: {p.sku}</div>

            <div className="mt-3 flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 font-bold text-[var(--color-ink)]">
                <Star size={14} className="fill-amber-400 stroke-amber-400" />
                {p.ratingAvg.toFixed(1)}
                <span className="text-[var(--color-ink-3)] font-normal">
                  ({p.ratingCount})
                </span>
              </span>
              <span className="text-[var(--color-ink-3)]" aria-hidden>·</span>
              <span className="inline-flex items-center gap-1 text-[var(--color-ink-2)]">
                <TrendingUp size={13} /> {p.salesCount} terjual
              </span>
              {p.isReady ? (
                <>
                  <span className="text-[var(--color-ink-3)]" aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1 text-[var(--color-success)] font-semibold">
                    <PackageCheck size={13} /> {p.stock} stok
                  </span>
                </>
              ) : null}
            </div>

            <div className="mt-4 rounded-xl bg-[var(--color-surface-soft)] p-4">
              <div className="flex items-end gap-3 flex-wrap">
                {promo ? (
                  <>
                    <div
                      className="text-3xl font-extrabold text-[var(--color-accent-500)]"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {rupiah(p.salePriceCents!)}
                    </div>
                    <div className="text-sm text-[var(--color-ink-3)] line-through">
                      {rupiah(p.priceCents)}
                    </div>
                    <span className="badge-promo">HEMAT {discountPct}%</span>
                  </>
                ) : (
                  <div
                    className="text-3xl font-extrabold text-[var(--color-ink)]"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    {rupiah(p.priceCents)}
                  </div>
                )}
              </div>
              {p.durationLabel && (
                <div className="mt-2 text-xs text-[var(--color-ink-2)] inline-flex items-center gap-1.5">
                  <Clock size={13} /> Durasi: {p.durationLabel}
                </div>
              )}
            </div>

            {p.priceTiers.length > 0 && (
              <div className="mt-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 text-sm">
                <div className="font-bold text-[var(--color-ink)] mb-1.5 inline-flex items-center gap-2">
                  <Tag size={14} className="text-[var(--color-accent-500)]" />
                  Harga grosir
                </div>
                <ul className="space-y-1">
                  {p.priceTiers.map((t) => (
                    <li
                      key={t.minQty}
                      className="flex justify-between text-[var(--color-ink-2)]"
                    >
                      <span>≥ {t.minQty} pcs</span>
                      <span
                        className="font-bold text-[var(--color-ink)] tabular-nums"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {rupiah(t.unitPriceCents)} / pcs
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Qty + actions */}
            <div className="mt-4">
              <label className="label !mb-2" htmlFor="qty-input">Jumlah</label>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="inline-flex items-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                  <IconButton
                    icon={Minus}
                    label="Kurangi"
                    size={14}
                    className="!size-10 !rounded-none hover:!bg-[var(--color-surface-soft)]"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                  />
                  <input
                    id="qty-input"
                    className="w-12 text-center bg-transparent outline-none font-bold text-[var(--color-ink)]"
                    value={qty}
                    onChange={(e) =>
                      setQty(
                        Math.max(1, Math.min(p.stock || 1, parseInt(e.target.value || "1", 10) || 1)),
                      )
                    }
                    inputMode="numeric"
                  />
                  <IconButton
                    icon={Plus}
                    label="Tambah"
                    size={14}
                    className="!size-10 !rounded-none hover:!bg-[var(--color-surface-soft)]"
                    onClick={() => setQty((q) => Math.min(p.stock || 1, q + 1))}
                    disabled={qty >= p.stock}
                  />
                </div>
                <div className="text-xs text-[var(--color-ink-3)]">
                  {p.isReady ? `Tersedia ${p.stock}` : "Stok habis"}
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" icon={ShoppingCart} onClick={addToCart} disabled={!p.isReady}>
                Keranjang
              </Button>
              <Button icon={Zap} onClick={buyNow} disabled={!p.isReady}>
                Beli sekarang
              </Button>
            </div>
            <div className="mt-3 text-[11px] text-[var(--color-ink-3)] inline-flex items-center gap-1.5">
              <ShieldCheck size={12} className="text-[var(--color-brand-700)]" />
              Stok dijaga atomic. Akun terkirim instan setelah pembayaran sukses.
            </div>
          </div>

          {/* Reviews */}
          <div className="card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-[var(--color-ink)] inline-flex items-center gap-2">
                <Star size={15} className="text-amber-500 fill-amber-400 stroke-amber-400" />
                Review pembeli
                <span className="text-[var(--color-ink-3)] font-normal text-sm">
                  ({reviews?.total ?? p.ratingCount})
                </span>
              </div>
              {p.ratingCount > 0 && (
                <div className="text-sm font-bold text-[var(--color-ink)]">
                  {p.ratingAvg.toFixed(1)}
                  <span className="text-[var(--color-ink-3)] font-normal">/5</span>
                </div>
              )}
            </div>
            {!reviews ? (
              <div className="text-sm text-[var(--color-ink-3)] py-4">Memuat review…</div>
            ) : reviews.total === 0 ? (
              <div className="text-sm text-[var(--color-ink-2)]">
                Belum ada review yang disetujui.
              </div>
            ) : (
              <>
                <ul className="space-y-3">
                  {reviews.items.map((r) => (
                    <li
                      key={r.id}
                      className="border-b border-[var(--color-border)] pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between text-sm">
                        <div className="font-bold text-[var(--color-ink)]">@{r.username}</div>
                        <div className="flex items-center gap-0.5 text-amber-400">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              size={13}
                              className={
                                i < r.rating
                                  ? "fill-amber-400 stroke-amber-400"
                                  : "stroke-[var(--color-border-strong)] fill-transparent"
                              }
                            />
                          ))}
                        </div>
                      </div>
                      <div className="text-xs text-[var(--color-ink-3)]">
                        {dateID(r.createdAt, { dateStyle: "medium" })}
                      </div>
                      {r.comment && (
                        <div className="text-sm text-[var(--color-ink)] mt-1 whitespace-pre-line break-words">
                          {r.comment}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <Pagination
                  page={reviews.page}
                  pageSize={reviews.pageSize}
                  total={reviews.total}
                  onPageChange={setReviewPage}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


/**
 * Skeleton halaman detail produk: gallery + thumbnail strip + deskripsi
 * di kiri; buy box (judul + harga + tombol) + reviews di kanan. Layout
 * meniru struktur asli supaya tidak ada layout shift saat data tiba.
 */
function ProductDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-3 w-40 bg-[var(--color-surface-soft)] rounded animate-pulse" />

      <div className="grid lg:grid-cols-[1.05fr_1fr] gap-5 lg:gap-7">
        <div className="space-y-3 min-w-0">
          <div className="card overflow-hidden">
            <div className="aspect-[4/3] bg-[var(--color-surface-soft)] animate-pulse" />
          </div>
          <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-lg bg-[var(--color-surface-soft)] animate-pulse"
              />
            ))}
          </div>
          <div className="card p-4 sm:p-5 space-y-2">
            <div className="h-4 w-24 bg-[var(--color-surface-soft)] rounded animate-pulse" />
            <div className="h-3 w-full bg-[var(--color-surface-soft)] rounded animate-pulse" />
            <div className="h-3 w-5/6 bg-[var(--color-surface-soft)] rounded animate-pulse" />
            <div className="h-3 w-2/3 bg-[var(--color-surface-soft)] rounded animate-pulse" />
          </div>
        </div>

        <div className="space-y-3 min-w-0">
          <div className="card p-5 sm:p-6 space-y-4 lg:sticky lg:top-20">
            <div className="space-y-2">
              <div className="h-3 w-20 bg-[var(--color-surface-soft)] rounded animate-pulse" />
              <div className="h-7 w-3/4 bg-[var(--color-surface-soft)] rounded animate-pulse" />
              <div className="h-3 w-32 bg-[var(--color-surface-soft)] rounded animate-pulse" />
            </div>
            <div className="rounded-xl bg-[var(--color-surface-soft)] p-4 space-y-2">
              <div className="h-8 w-40 bg-[var(--color-surface-mute)] rounded animate-pulse" />
              <div className="h-3 w-24 bg-[var(--color-surface-mute)] rounded animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-16 bg-[var(--color-surface-soft)] rounded animate-pulse" />
              <div className="h-10 w-32 bg-[var(--color-surface-soft)] rounded-lg animate-pulse" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-10 bg-[var(--color-surface-soft)] rounded-lg animate-pulse" />
              <div className="h-10 bg-[var(--color-surface-soft)] rounded-lg animate-pulse" />
            </div>
          </div>
          <div className="card p-4 sm:p-5 space-y-3">
            <div className="h-4 w-32 bg-[var(--color-surface-soft)] rounded animate-pulse" />
            <div className="h-3 w-full bg-[var(--color-surface-soft)] rounded animate-pulse" />
            <div className="h-3 w-2/3 bg-[var(--color-surface-soft)] rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
