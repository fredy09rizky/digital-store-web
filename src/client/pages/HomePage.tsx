import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Zap,
  ShieldCheck,
  BadgeCheck,
  ArrowRight,
  Flame,
  Tag,
  PackageCheck,
  Clock4,
  Search,
  Star,
} from "lucide-react";
import { api } from "../lib/api";
import { ProductCard } from "../components/ProductCard";
import { CardSkeleton } from "../components/Loading";
import { LinkButton } from "../components/Button";
import { Thumbnail } from "../components/Thumbnail";
import { categoryIcon } from "../lib/category-icons";
import { rupiah } from "../lib/format";
import type { PublicCategory, PublicProductSummary } from "@shared/types";

interface Home {
  latest: PublicProductSummary[];
  popular: PublicProductSummary[];
  promo: PublicProductSummary[];
  ready: PublicProductSummary[];
}

export default function HomePage() {
  const [data, setData] = useState<Home | null>(null);
  const [cats, setCats] = useState<PublicCategory[]>([]);

  useEffect(() => {
    Promise.all([api<Home>("/home"), api<PublicCategory[]>("/categories")])
      .then(([h, c]) => {
        setData(h);
        setCats(c);
      })
      .catch(() => null);
  }, []);

  const featured = (data?.popular?.length ? data.popular : data?.latest ?? []).slice(0, 3);

  return (
    <div className="space-y-12 lg:space-y-16">
      <Hero featured={featured} cats={cats} />
      <CategoriesStrip cats={cats} />

      <Section title="Produk terbaru" icon={Clock4} link="/katalog?sort=newest">
        {data ? <Grid items={data.latest} /> : <SkeletonRow />}
      </Section>

      {data && data.promo.length > 0 && (
        <Section title="Lagi promo" icon={Tag} link="/katalog?sort=newest" accent>
          <Grid items={data.promo} />
        </Section>
      )}

      <Section title="Paling laris" icon={Flame} link="/katalog?sort=best_seller">
        {data ? <Grid items={data.popular} /> : <SkeletonRow />}
      </Section>

      <Section title="Ready stock" icon={PackageCheck} link="/katalog?ready=1">
        {data ? <Grid items={data.ready} /> : <SkeletonRow />}
      </Section>
    </div>
  );
}

/* ---------- Hero ---------- */
function Hero({ featured, cats }: { featured: PublicProductSummary[]; cats: PublicCategory[] }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  return (
    <section
      className="relative overflow-hidden rounded-[24px] text-white animate-fade-in"
      style={{ backgroundColor: "#1b1547" }}
    >
      {/* Tekstur titik halus (bukan gradient) untuk memberi kedalaman */}
      <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" />
      {/* Garis aksen tipis di tepi kiri sebagai penanda brand */}
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: "var(--color-accent-500)" }} />

      <div className="relative grid lg:grid-cols-[1.1fr_0.9fr] gap-8 lg:gap-10 items-center p-6 sm:p-9 lg:p-12">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-sm text-white/90 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] px-3 py-1.5">
            <Sparkles size={13} />
            Marketplace digital terkurasi
          </div>
          <h1
            className="mt-4 sm:mt-5 text-[2rem] leading-[1.08] sm:text-4xl lg:text-[3.1rem] lg:leading-[1.05] font-bold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Akun premium,
            <br />{" "}
            <span style={{ color: "#c4b5ff" }}>terkirim instan.</span>
          </h1>
          <p className="mt-3 sm:mt-4 text-white/80 max-w-xl text-sm sm:text-base leading-relaxed">
            Streaming, AI, produktivitas, sampai tools developer. Setiap akun dijamin valid dan
            otomatis terkirim setelah pembayaran berhasil.
          </p>

          {/* Search */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) nav(`/katalog?q=${encodeURIComponent(q.trim())}`);
              else nav("/katalog");
            }}
            className="mt-5 sm:mt-6 flex items-stretch h-12 max-w-md rounded-full bg-white/95 overflow-hidden shadow-[var(--shadow-elev)]"
          >
            <div className="pl-4 grid place-items-center text-[var(--color-ink-3)]">
              <Search size={18} />
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Mau cari akun apa hari ini?"
              aria-label="Cari produk"
              className="flex-1 min-w-0 bg-transparent px-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)] outline-none"
            />
            <button
              type="submit"
              className="m-1.5 inline-flex items-center gap-1.5 px-4 sm:px-5 rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: "var(--color-brand-500)" }}
            >
              Cari <ArrowRight size={15} />
            </button>
          </form>

          {/* Trust row */}
          <div className="mt-6 sm:mt-7 flex flex-wrap gap-x-5 gap-y-2.5">
            <Trust icon={Zap} label="Kirim instan otomatis" />
            <Trust icon={ShieldCheck} label="Stok terverifikasi" />
            <Trust icon={BadgeCheck} label="Bergaransi" />
          </div>
        </div>

        {/* Highlight panel (selalu terisi rapi) */}
        <div className="min-w-0">
          <HighlightPanel featured={featured} cats={cats} />
        </div>
      </div>
    </section>
  );
}

function Trust({ icon: Icon, label }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 text-white/85 text-[13px] sm:text-sm">
      <span className="grid place-items-center size-7 rounded-full bg-white/12 border border-white/15">
        <Icon size={14} />
      </span>
      {label}
    </div>
  );
}

/**
 * Panel kanan hero. Mengisi ruang dengan konten bermakna:
 *  - ada produk unggulan → daftar 3 produk teratas (thumb + nama + harga).
 *  - kalau belum ada → grid kategori sebagai jalan masuk cepat.
 * CTA "Telusuri katalog" menyatu di dalam panel (tidak mengambang).
 */
function HighlightPanel({ featured, cats }: { featured: PublicProductSummary[]; cats: PublicCategory[] }) {
  const items = featured.slice(0, 3);
  const topCats = cats.slice(0, 6);
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-4 sm:p-5 shadow-[var(--shadow-modal)]">
      <div className="flex items-center justify-between mb-3">
        <div className="inline-flex items-center gap-1.5 text-white/90 text-[11px] font-semibold uppercase tracking-[0.12em]">
          <Sparkles size={13} />
          {items.length > 0 ? "Sorotan hari ini" : "Jelajahi kategori"}
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((p) => {
            const price = p.salePriceCents ?? p.priceCents;
            return (
              <li key={p.id}>
                <Link
                  to={`/p/${p.slug}`}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/12 transition p-2"
                >
                  <div className="size-12 rounded-lg overflow-hidden shrink-0 bg-white/10">
                    <Thumbnail src={p.thumbnailUrl} alt={p.name} fallbackSize={20} loading="eager" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-white text-[13px] font-semibold line-clamp-1">{p.name}</div>
                    <div className="inline-flex items-center gap-1 text-white/65 text-[11px]">
                      <Star size={10} className="fill-amber-300 stroke-amber-300" />
                      {p.ratingAvg.toFixed(1)} · {p.salesCount} terjual
                    </div>
                  </div>
                  <div
                    className="text-white font-bold text-sm tabular-nums shrink-0"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    {rupiah(price)}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : topCats.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {topCats.map((c) => {
            const Icon = categoryIcon(c);
            return (
              <Link
                key={c.id}
                to={`/katalog?category=${c.slug}`}
                className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/12 transition p-2.5"
              >
                <span className="grid place-items-center size-8 rounded-lg bg-white/12 text-white shrink-0">
                  <Icon size={16} />
                </span>
                <span className="text-white text-[13px] font-medium line-clamp-1">{c.name}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="py-8 text-center text-white/70 text-sm">
          Katalog premium siap dijelajahi.
        </div>
      )}

      <LinkButton
        to="/katalog"
        iconRight={ArrowRight}
        block
        className="mt-4 !bg-white !text-[var(--color-brand-700)] hover:!bg-white/90"
      >
        Telusuri katalog
      </LinkButton>
    </div>
  );
}

/* ---------- Categories ---------- */
function CategoriesStrip({ cats }: { cats: PublicCategory[] }) {
  if (!cats.length) return null;
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title">Kategori populer</h2>
        <Link
          to="/katalog"
          className="text-sm font-semibold text-[var(--color-brand-700)] hover:text-[var(--color-brand-600)] inline-flex items-center gap-1"
        >
          Lihat semua <ArrowRight size={14} />
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none snap-x">
        {cats.map((c) => {
          const Icon = categoryIcon(c);
          return (
            <Link
              key={c.id}
              to={`/katalog?category=${c.slug}`}
              className="snap-start shrink-0 w-[220px] sm:w-auto sm:flex-1 sm:min-w-[180px] card-flat lift p-4 flex items-center gap-3"
            >
              <div className="size-12 rounded-xl bg-[var(--color-surface-tint)] text-[var(--color-brand-700)] grid place-items-center shrink-0">
                <Icon size={22} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm text-[var(--color-ink)] truncate">{c.name}</div>
                <div className="text-[11px] text-[var(--color-ink-2)] line-clamp-2">
                  {c.description ?? "Lihat semua produk di kategori ini"}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Section + Grid ---------- */
function Section({
  title,
  icon: Icon,
  link,
  accent,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  link?: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div
              className={
                "size-9 rounded-xl grid place-items-center " +
                (accent
                  ? "bg-[var(--color-accent-50)] text-[var(--color-accent-500)]"
                  : "bg-[var(--color-surface-tint)] text-[var(--color-brand-700)]")
              }
            >
              <Icon size={17} />
            </div>
          )}
          <h2 className="section-title">{title}</h2>
        </div>
        {link && (
          <Link
            to={link}
            className="text-sm font-semibold text-[var(--color-brand-700)] hover:text-[var(--color-brand-600)] inline-flex items-center gap-1"
          >
            Lihat semua <ArrowRight size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Grid({ items }: { items: PublicProductSummary[] }) {
  if (!items.length)
    return (
      <div className="text-sm text-[var(--color-ink-2)]">Belum ada produk di kategori ini.</div>
    );
  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((p) => (
        <ProductCard key={p.id} p={p} />
      ))}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
