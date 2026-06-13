import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  Trash2,
  Minus,
  Plus,
  Package,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { api } from "../lib/api";
import type { CartView } from "@shared/types";
import { rupiah } from "../lib/format";
import { useToast } from "../components/Toast";
import { useApp } from "../state/AppProviders";
import { Empty } from "../components/Empty";
import { CartItemSkeleton } from "../components/Loading";
import { Button, IconButton, LinkButton } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";

export default function CartPage() {
  const [cart, setCart] = useState<CartView | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const toast = useToast();
  const nav = useNavigate();
  const { refreshCart } = useApp();

  async function reload() {
    const c = await api<CartView>("/cart");
    setCart(c);
    refreshCart();
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function update(itemId: string, qty: number) {
    try {
      const c = await api<CartView>("/cart/update", { body: { itemId, qty } });
      setCart(c);
      refreshCart();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal update.");
    }
  }
  async function remove(itemId: string) {
    const c = await api<CartView>("/cart/remove", { body: { itemId } });
    setCart(c);
    refreshCart();
    toast.info("Item dihapus dari keranjang.");
  }
  async function clear() {
    const c = await api<CartView>("/cart/clear", { body: {} });
    setCart(c);
    refreshCart();
    setConfirmClear(false);
    toast.info("Keranjang dikosongkan.");
  }

  if (!cart) {
    // Skeleton: header + list item placeholders + summary panel.
    return (
      <div className="grid lg:grid-cols-[1fr_360px] gap-5">
        <div className="space-y-4 min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-lg bg-[var(--color-surface-soft)] animate-pulse" />
            <div className="h-7 w-32 bg-[var(--color-surface-soft)] rounded animate-pulse" />
          </div>
          <ul className="card divide-y divide-[var(--color-border)]">
            {Array.from({ length: 3 }).map((_, i) => (
              <CartItemSkeleton key={i} />
            ))}
          </ul>
        </div>
        <aside className="card p-5 space-y-3 h-fit lg:sticky lg:top-20">
          <div className="h-5 w-32 bg-[var(--color-surface-soft)] rounded animate-pulse" />
          <div className="h-4 w-full bg-[var(--color-surface-soft)] rounded animate-pulse" />
          <div className="h-4 w-full bg-[var(--color-surface-soft)] rounded animate-pulse" />
          <div className="h-4 w-2/3 bg-[var(--color-surface-soft)] rounded animate-pulse" />
          <div className="divider" />
          <div className="h-7 w-1/2 bg-[var(--color-surface-soft)] rounded animate-pulse" />
          <div className="h-11 w-full bg-[var(--color-surface-soft)] rounded animate-pulse" />
        </aside>
      </div>
    );
  }
  const empty = cart.items.length === 0;

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      <div className="space-y-4 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
              <ShoppingCart size={18} />
            </div>
            <h1
              className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Keranjang
              {!empty && (
                <span className="ml-2 text-sm text-[var(--color-ink-3)] font-semibold">
                  ({cart.items.length})
                </span>
              )}
            </h1>
          </div>
          {!empty && (
            <button
              onClick={() => setConfirmClear(true)}
              className="text-xs font-semibold text-[var(--color-danger)] hover:underline inline-flex items-center gap-1"
            >
              <Trash2 size={12} /> Kosongkan
            </button>
          )}
        </div>

        {empty ? (
          <Empty
            icon={ShoppingCart}
            title="Keranjang masih kosong"
            hint="Cek katalog dan temukan produk premium favoritmu."
            action={
              <LinkButton to="/katalog" icon={Package}>
                Telusuri katalog
              </LinkButton>
            }
          />
        ) : (
          <ul className="card divide-y divide-[var(--color-border)]">
            {cart.items.map((it) => {
              const stockShort = it.qty > it.stockAvailable;
              return (
                <li key={it.id} className="p-3 sm:p-4 flex flex-wrap sm:flex-nowrap gap-3 sm:items-center">
                  <Link to={`/p/${it.productSlug}`} className="size-16 sm:size-20 rounded-lg overflow-hidden bg-[var(--color-surface-tint)] shrink-0 border border-[var(--color-border)]">
                    {it.thumbnailUrl ? (
                      <img src={it.thumbnailUrl} className="size-full object-cover" alt="" />
                    ) : (
                      <div className="size-full grid place-items-center text-[var(--color-brand-300)]">
                        <Package size={20} />
                      </div>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/p/${it.productSlug}`}
                      className="font-bold text-[var(--color-ink)] hover:text-[var(--color-brand-700)] line-clamp-2 text-sm sm:text-base"
                    >
                      {it.productName}
                    </Link>
                    <div className="text-xs text-[var(--color-ink-2)] mt-0.5">
                      {rupiah(it.effectiveUnitPriceCents)} <span className="text-[var(--color-ink-3)]">/ pcs</span>
                    </div>
                    {stockShort && (
                      <div className="text-xs text-[var(--color-danger)] mt-1.5 inline-flex items-center gap-1 bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-danger)_32%,transparent)] px-2 py-1 rounded-md">
                        <AlertTriangle size={12} />
                        Stok hanya {it.stockAvailable}. Kurangi qty atau hapus.
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 w-full sm:w-auto sm:ml-auto shrink-0">
                    <QtyControl
                      value={it.qty}
                      min={1}
                      max={Math.max(1, it.stockAvailable)}
                      onChange={(q) => update(it.id, q)}
                    />
                    <div className="text-right min-w-[88px]">
                      <div
                        className="font-extrabold text-[var(--color-ink)]"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {rupiah(it.subtotalCents)}
                      </div>
                      <button
                        onClick={() => remove(it.id)}
                        className="text-[11px] text-[var(--color-danger)] hover:underline mt-0.5 inline-flex items-center gap-1"
                      >
                        <Trash2 size={11} /> Hapus
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <aside className="card p-5 space-y-3 h-fit lg:sticky lg:top-20">
        <div className="font-bold text-[var(--color-ink)] text-base">Ringkasan order</div>
        <div className="space-y-2">
          <Row label="Subtotal" value={rupiah(cart.subtotalCents)} />
          <Row label="Diskon" value={`- ${rupiah(cart.discountCents)}`} muted />
          <Row label="Biaya layanan" value={rupiah(cart.serviceFeeCents)} muted />
        </div>
        <div className="divider" />
        <Row label="Total" value={rupiah(cart.totalCents)} bold />
        <Button
          block
          size="lg"
          icon={ArrowRight}
          disabled={empty}
          onClick={() => nav("/checkout")}
        >
          Lanjut ke checkout
        </Button>
        <p className="text-xs text-[var(--color-ink-3)] leading-relaxed">
          Voucher dan metode pembayaran dipilih di halaman checkout. Stok akan direservasi 5 menit
          setelah order dibuat.
        </p>
      </aside>

      <ConfirmDialog
        open={confirmClear}
        title="Kosongkan keranjang?"
        tone="warning"
        confirmLabel="Kosongkan semua"
        description="Semua item di keranjang akan dihapus. Kamu masih bisa menambahkannya kembali nanti dari halaman katalog."
        onClose={() => setConfirmClear(false)}
        onConfirm={clear}
      />
    </div>
  );
}

function QtyControl({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (q: number) => void;
}) {
  // Draft lokal supaya user bisa mengetik bebas (boleh kosong sementara).
  // Commit ke server hanya saat blur / Enter — bukan tiap ketukan.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit() {
    const n = parseInt(draft, 10);
    // Kosong / 0 / tidak valid → kembalikan ke nilai semula (tidak boleh 0).
    if (!Number.isFinite(n) || n < min) {
      setDraft(String(value));
      return;
    }
    // Clamp ke stok tersedia (tidak boleh melebihi stok).
    const clamped = Math.min(max, Math.max(min, n));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  function step(delta: number) {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next !== value) onChange(next);
  }

  return (
    <div className="inline-flex items-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
      <IconButton
        icon={Minus}
        label="Kurangi"
        size={14}
        onClick={() => step(-1)}
        disabled={value <= min}
        className="!size-[34px] !rounded-none hover:!bg-[var(--color-surface-soft)]"
      />
      <input
        className="w-14 text-center bg-transparent outline-none text-sm font-bold text-[var(--color-ink)] tabular-nums"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        inputMode="numeric"
        aria-label="Kuantitas"
      />
      <IconButton
        icon={Plus}
        label="Tambah"
        size={14}
        onClick={() => step(1)}
        disabled={value >= max}
        className="!size-[34px] !rounded-none hover:!bg-[var(--color-surface-soft)]"
      />
    </div>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-sm ${muted ? "text-[var(--color-ink-2)]" : "text-[var(--color-ink)]"}`}>
      <span>{label}</span>
      <span
        className={bold ? "text-xl font-extrabold text-[var(--color-ink)]" : "font-semibold"}
        style={bold ? { fontFamily: "var(--font-ui)" } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
