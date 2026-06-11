import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  PackageCheck,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { ProductCard } from "../components/ProductCard";
import type { PublicCategory, PublicProductSummary } from "@shared/types";
import { CardSkeleton } from "../components/Loading";
import { Empty } from "../components/Empty";
import { useModalEffects } from "../lib/hooks";
import { categoryIcon } from "../lib/category-icons";

interface ProductsResp {
  items: PublicProductSummary[];
  pagination: { page: number; pageSize: number; total: number };
}

const SORTS: { value: string; label: string }[] = [
  { value: "newest", label: "Terbaru" },
  { value: "popular", label: "Populer" },
  { value: "best_seller", label: "Terlaris" },
  { value: "cheapest", label: "Termurah" },
  { value: "expensive", label: "Termahal" },
];

export default function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const [resp, setResp] = useState<ProductsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [cats, setCats] = useState<PublicCategory[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const sort = params.get("sort") ?? "newest";
  const minPrice = params.get("min_price") ?? "";
  const maxPrice = params.get("max_price") ?? "";
  const ready = params.get("ready") ?? "";
  const page = parseInt(params.get("page") ?? "1", 10) || 1;

  const search = useMemo(() => Object.fromEntries(params.entries()), [params]);
  const hasActiveFilter = !!(category || minPrice || maxPrice || ready);

  useEffect(() => {
    api<PublicCategory[]>("/categories")
      .then(setCats)
      .catch(() => null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const usp = new URLSearchParams(search);
    if (!usp.get("sort")) usp.set("sort", "newest");
    api<ProductsResp>(`/products?${usp.toString()}`)
      .then((r) => {
        if (!cancelled) {
          setResp(r);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search]);

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  }

  function resetFilter() {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (sort) next.set("sort", sort);
    setParams(next, { replace: true });
  }

  const total = resp?.pagination.total ?? 0;
  const pageSize = resp?.pagination.pageSize ?? 24;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Body scroll lock + ESC saat filter sheet di mobile dibuka.
  useModalEffects(filterOpen, () => setFilterOpen(false));

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-5 lg:gap-6">
      {/* Sidebar filter (desktop) */}
      <aside className="hidden lg:block">
        <div className="card p-5 sticky top-20 space-y-5">
          <FilterPanel
            cats={cats}
            category={category}
            minPrice={minPrice}
            maxPrice={maxPrice}
            ready={ready}
            update={update}
            onReset={resetFilter}
            hasActiveFilter={hasActiveFilter}
          />
        </div>
      </aside>

      {/* Mobile filter sheet */}
      {filterOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFilterOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto bg-[var(--color-surface)] rounded-t-2xl p-5 shadow-[var(--shadow-modal)] animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-base inline-flex items-center gap-2">
                <Filter size={18} /> Filter
              </div>
              <button
                onClick={() => setFilterOpen(false)}
                aria-label="Tutup"
                className="btn-icon"
              >
                <X size={18} />
              </button>
            </div>
            <FilterPanel
              cats={cats}
              category={category}
              minPrice={minPrice}
              maxPrice={maxPrice}
              ready={ready}
              update={update}
              onReset={resetFilter}
              hasActiveFilter={hasActiveFilter}
            />
            <button onClick={() => setFilterOpen(false)} className="btn-primary w-full mt-4">
              Terapkan
            </button>
          </div>
        </div>
      )}

      <main className="space-y-4 min-w-0">
        {/* Toolbar */}
        <div className="card p-3 sm:p-4 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              onClick={() => setFilterOpen(true)}
              className="lg:hidden inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--color-surface-soft)]"
            >
              <SlidersHorizontal size={14} /> Filter
              {hasActiveFilter && (
                <span className="size-1.5 rounded-full bg-[var(--color-accent-500)]" />
              )}
            </button>
            <div className="text-sm text-[var(--color-ink-2)] truncate">
              {loading ? (
                "Memuat…"
              ) : (
                <>
                  <span className="font-bold text-[var(--color-ink)]">
                    {total.toLocaleString("id-ID")}
                  </span>{" "}
                  produk
                  {q && (
                    <>
                      {" "}untuk{" "}
                      <span className="font-semibold text-[var(--color-ink)]">"{q}"</span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-ink-3)] hidden sm:inline">Urut:</label>
            <select
              className="select-input !w-auto !py-2 !text-sm"
              value={sort}
              onChange={(e) => update({ sort: e.target.value })}
              aria-label="Urutkan produk"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active filter chips */}
        {hasActiveFilter && (
          <div className="flex flex-wrap items-center gap-2">
            {category && (
              <ActiveChip label={`Kategori: ${cats.find((c) => c.slug === category)?.name ?? category}`} onClear={() => update({ category: undefined })} />
            )}
            {minPrice && <ActiveChip label={`Min Rp${minPrice}`} onClear={() => update({ min_price: undefined })} />}
            {maxPrice && <ActiveChip label={`Max Rp${maxPrice}`} onClear={() => update({ max_price: undefined })} />}
            {ready === "1" && <ActiveChip label="Ready stock" onClear={() => update({ ready: undefined })} />}
            <button
              onClick={resetFilter}
              className="text-xs font-semibold text-[var(--color-brand-700)] hover:text-[var(--color-brand-800)] inline-flex items-center gap-1"
            >
              <RotateCcw size={12} /> Reset semua
            </button>
          </div>
        )}

        {/* Results */}
        {loading ? (
          <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : resp?.items.length === 0 ? (
          <Empty
            icon={Search}
            title="Belum ada produk yang cocok"
            hint="Coba ubah kata kunci atau filter, atau lihat kategori lain."
            action={
              hasActiveFilter ? (
                <button onClick={resetFilter} className="btn-outline">
                  <RotateCcw size={14} />
                  Reset filter
                </button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {resp!.items.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 mt-6">
                <PageBtn disabled={page <= 1} ariaLabel="Halaman sebelumnya" onClick={() => update({ page: String(page - 1) })}>
                  <ChevronLeft size={16} />
                </PageBtn>
                {pageNumbers(page, totalPages).map((p, idx) =>
                  p === "..." ? (
                    <span key={`gap-${idx}`} className="px-2 text-[var(--color-ink-3)]">
                      …
                    </span>
                  ) : (
                    <PageBtn
                      key={p}
                      active={p === page}
                      ariaLabel={`Halaman ${p}`}
                      onClick={() => update({ page: String(p) })}
                    >
                      {p}
                    </PageBtn>
                  ),
                )}
                <PageBtn disabled={page >= totalPages} ariaLabel="Halaman berikutnya" onClick={() => update({ page: String(page + 1) })}>
                  <ChevronRight size={16} />
                </PageBtn>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function FilterPanel({
  cats,
  category,
  minPrice,
  maxPrice,
  ready,
  update,
  onReset,
  hasActiveFilter,
}: {
  cats: PublicCategory[];
  category: string;
  minPrice: string;
  maxPrice: string;
  ready: string;
  update: (patch: Record<string, string | undefined>) => void;
  onReset: () => void;
  hasActiveFilter: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="font-bold text-sm inline-flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-[var(--color-brand-700)]" />
          Filter
        </div>
        {hasActiveFilter && (
          <button
            onClick={onReset}
            className="text-xs font-semibold text-[var(--color-brand-700)] inline-flex items-center gap-1"
          >
            <RotateCcw size={12} /> Reset
          </button>
        )}
      </div>

      <div>
        <div className="label !mb-2">Kategori</div>
        <div className="flex flex-col gap-1">
          <CatBtn active={!category} onClick={() => update({ category: undefined })}>
            Semua kategori
          </CatBtn>
          {cats.map((c) => {
            const CIcon = categoryIcon(c);
            return (
              <CatBtn
                key={c.id}
                active={category === c.slug}
                onClick={() => update({ category: c.slug })}
              >
                <CIcon size={15} /> {c.name}
              </CatBtn>
            );
          })}
        </div>
      </div>

      <div>
        <div className="label !mb-2">Harga</div>
        <div className="grid grid-cols-2 gap-2">
          <input
            className="input"
            placeholder="Min"
            aria-label="Harga minimum"
            inputMode="numeric"
            defaultValue={minPrice}
            onBlur={(e) => update({ min_price: e.target.value })}
          />
          <input
            className="input"
            placeholder="Max"
            aria-label="Harga maksimum"
            inputMode="numeric"
            defaultValue={maxPrice}
            onBlur={(e) => update({ max_price: e.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-[var(--color-ink)] inline-flex items-center gap-2">
          <PackageCheck size={14} className="text-[var(--color-brand-700)]" /> Hanya ready stock
        </div>
        <button
          onClick={() => update({ ready: ready === "1" ? undefined : "1" })}
          className={`relative w-10 h-6 rounded-full transition ${
            ready === "1" ? "bg-[var(--color-brand-500)]" : "bg-[var(--color-border)]"
          }`}
          aria-pressed={ready === "1"}
          aria-label="Toggle ready stock"
        >
          <span
            className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-[var(--color-surface)] shadow transition ${
              ready === "1" ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>
    </>
  );
}

function CatBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "inline-flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm transition " +
        (active
          ? "bg-[var(--color-surface-tint)] text-[var(--color-brand-700)] font-bold"
          : "text-[var(--color-ink-2)] hover:bg-[var(--color-surface-soft)]")
      }
    >
      {children}
    </button>
  );
}

function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-tint)] text-[var(--color-brand-700)] text-xs font-semibold pl-3 pr-1.5 py-1 border border-[var(--color-brand-200)]">
      {label}
      <button
        onClick={onClear}
        className="size-5 rounded-full hover:bg-[var(--color-surface)] inline-flex items-center justify-center"
        aria-label={`Hapus filter ${label}`}
      >
        <X size={12} />
      </button>
    </span>
  );
}

function PageBtn({
  active,
  disabled,
  onClick,
  ariaLabel,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={
        "min-w-[36px] h-9 px-3 inline-flex items-center justify-center rounded-lg text-sm font-bold border transition " +
        (active
          ? "bg-[var(--color-brand-500)] border-[var(--color-brand-500)] text-white"
          : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-ink-2)] hover:border-[var(--color-brand-500)] hover:text-[var(--color-brand-700)]") +
        (disabled ? " opacity-40 cursor-not-allowed hover:!border-[var(--color-border)]" : "")
      }
    >
      {children}
    </button>
  );
}

function pageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "...")[] = [];
  out.push(1);
  if (current > 3) out.push("...");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) out.push(i);
  if (current < total - 2) out.push("...");
  out.push(total);
  return out;
}
