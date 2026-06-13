import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CreditCard,
  Wallet,
  Building2,
  QrCode,
  Tag,
  Package,
  CheckCircle2,
  ShoppingBag,
  AlertTriangle,
} from "lucide-react";
import { api } from "../lib/api";
import type { CartView } from "@shared/types";
import { rupiah } from "../lib/format";
import { useApp } from "../state/AppProviders";
import { Loading } from "../components/Loading";
import { Empty } from "../components/Empty";
import { Button, LinkButton } from "../components/Button";
import { Alert } from "../components/Alert";
import { useShake } from "../lib/hooks";

export default function CheckoutPage() {
  const [cart, setCart] = useState<CartView | null>(null);
  const [voucher, setVoucher] = useState("");
  const [method, setMethod] = useState<"qris" | "bank_transfer" | "wallet">("qris");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { boot, refreshCart } = useApp();
  const nav = useNavigate();
  const { ref: summaryRef, shake } = useShake<HTMLElement>();

  const bankEnabled = boot?.paymentOptions?.bankTransfer ?? false;
  const balance = boot?.user?.balanceCents ?? 0;

  useEffect(() => {
    api<CartView>("/cart")
      .then(setCart)
      .catch(() => null);
  }, []);

  if (!cart) return <Loading label="Memuat keranjang…" />;
  const empty = cart.items.length === 0;
  const insufficient = method === "wallet" && cart.totalCents > balance;

  async function placeOrder() {
    setErr(null);
    if (empty) {
      setErr("Keranjang kosong.");
      shake();
      return;
    }
    if (insufficient) {
      setErr("Saldo tidak cukup untuk pesanan ini. Ganti metode atau top up dulu.");
      shake();
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ orderId: string; orderCode: string }>("/checkout", {
        body: {
          paymentMethod: method,
          voucherCode: voucher || undefined,
          notes: notes || undefined,
        },
      });
      // Backend sudah menghapus cart_items setelah order dibuat. Sinkronkan
      // badge keranjang di shell.
      refreshCart();
      if (method === "wallet") {
        nav(`/sukses/${res.orderCode}`, { replace: true });
      } else {
        nav(`/pembayaran/${res.orderCode}`, { replace: true });
      }
    } catch (e: any) {
      setErr(e?.message ?? "Gagal membuat order. Coba lagi.");
      shake();
    } finally {
      setBusy(false);
    }
  }

  if (empty) {
    return (
      <Empty
        icon={ShoppingBag}
        title="Tidak ada item untuk di-checkout"
        hint="Tambahkan produk ke keranjang dulu sebelum lanjut."
        action={
          <LinkButton to="/katalog" icon={Package}>
            Telusuri katalog
          </LinkButton>
        }
      />
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      <div className="space-y-4 min-w-0">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
            <CreditCard size={18} />
          </div>
          <h1
            className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Checkout
          </h1>
        </div>

        {/* Items */}
        <div className="card p-4 sm:p-5">
          <SectionHeader icon={ShoppingBag}>Item ({cart.items.length})</SectionHeader>
          <ul className="divide-y divide-[var(--color-border)]">
            {cart.items.map((it) => (
              <li key={it.id} className="py-3 flex items-center gap-3">
                <div className="size-12 rounded-lg overflow-hidden bg-[var(--color-surface-tint)] shrink-0 border border-[var(--color-border)]">
                  {it.thumbnailUrl ? (
                    <img src={it.thumbnailUrl} className="size-full object-cover" alt="" />
                  ) : (
                    <div className="size-full grid place-items-center text-[var(--color-brand-300)]">
                      <Package size={16} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-[var(--color-ink)] line-clamp-1">
                    {it.productName}
                  </div>
                  <div className="text-xs text-[var(--color-ink-2)]">
                    {it.qty} × {rupiah(it.effectiveUnitPriceCents)}
                  </div>
                </div>
                <div
                  className="font-extrabold text-sm text-[var(--color-ink)]"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {rupiah(it.subtotalCents)}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Voucher */}
        <div className="card p-4 sm:p-5">
          <SectionHeader icon={Tag}>Voucher</SectionHeader>
          <div className="relative">
            <Tag
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] pointer-events-none"
            />
            <input
              className="input !pl-9 uppercase tracking-wider"
              placeholder="Masukkan kode voucher"
              aria-label="Kode voucher"
              value={voucher}
              onChange={(e) => setVoucher(e.target.value.toUpperCase())}
              maxLength={40}
            />
          </div>
          <p className="text-xs text-[var(--color-ink-3)] mt-2 leading-relaxed">
            Voucher divalidasi backend saat order dibuat. Tidak digabung dengan harga spesial produk.
          </p>
        </div>

        {/* Payment method */}
        <div className="card p-4 sm:p-5">
          <SectionHeader icon={CreditCard}>Metode pembayaran</SectionHeader>
          <div className={`grid gap-2.5 ${bankEnabled ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            <Method
              icon={QrCode}
              active={method === "qris"}
              onClick={() => setMethod("qris")}
              title="QRIS"
              desc="Scan dari semua e-wallet (via Pakasir)"
            />
            {bankEnabled && (
              <Method
                icon={Building2}
                active={method === "bank_transfer"}
                onClick={() => setMethod("bank_transfer")}
                title="Transfer Bank"
                desc="Manual + upload bukti, verifikasi admin"
              />
            )}
            <Method
              icon={Wallet}
              active={method === "wallet"}
              onClick={() => setMethod("wallet")}
              title="Saldo internal"
              desc={`Saldo kamu: ${rupiah(balance)}`}
              warning={insufficient ? "Saldo tidak mencukupi" : undefined}
            />
          </div>
        </div>

        {/* Notes */}
        <div className="card p-4 sm:p-5">
          <SectionHeader>Catatan order (opsional)</SectionHeader>
          <textarea
            className="textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={200}
            aria-label="Catatan order"
            placeholder="Mis. preferensi format, region, atau catatan lain untuk admin."
          />
          <div className="flex justify-end text-xs text-[var(--color-ink-3)] mt-1">
            {notes.length}/200
          </div>
        </div>
      </div>

      {/* Summary aside */}
      <aside ref={summaryRef} className="card p-5 space-y-3 h-fit lg:sticky lg:top-20">
        <div className="font-bold text-[var(--color-ink)] text-base">Ringkasan</div>
        <div className="space-y-2">
          <Row label="Subtotal" value={rupiah(cart.subtotalCents)} />
          <Row label="Biaya layanan" value={rupiah(cart.serviceFeeCents)} muted />
        </div>
        <div className="divider" />
        <Row label="Total" value={rupiah(cart.totalCents)} bold />
        {err && (
          <Alert tone="error" onClose={() => setErr(null)}>
            {err}
          </Alert>
        )}
        {insufficient && (
          <div className="text-xs text-[var(--color-danger)] inline-flex items-start gap-1.5 bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-danger)_32%,transparent)] rounded-md p-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Saldo kurang. Top up dulu di{" "}
              <Link to="/akun" className="font-semibold underline">
                halaman akun
              </Link>
              .
            </span>
          </div>
        )}
        <Button
          block
          size="lg"
          icon={CheckCircle2}
          onClick={placeOrder}
          disabled={empty || busy || insufficient}
          loading={busy}
        >
          {busy ? "Memproses…" : "Buat order"}
        </Button>
        <p className="text-xs text-[var(--color-ink-3)] leading-relaxed">
          Stok direservasi 5 menit setelah order dibuat. Pembayaran setelah waktu habis akan
          ditolak otomatis.
        </p>
      </aside>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  children,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="font-bold text-[var(--color-ink)] text-sm mb-3 inline-flex items-center gap-2">
      {Icon && <Icon size={15} className="text-[var(--color-brand-700)]" />}
      {children}
    </div>
  );
}

function Method({
  icon: Icon,
  active,
  onClick,
  title,
  desc,
  warning,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  warning?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-xl border-2 p-3.5 text-left transition relative " +
        (active
          ? "bg-[var(--color-surface-tint)] border-[var(--color-brand-500)] text-[var(--color-ink)]"
          : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-ink)] hover:border-[var(--color-brand-300)]")
      }
    >
      <div className="flex items-center gap-2.5">
        <div
          className={
            "size-8 rounded-lg grid place-items-center shrink-0 " +
            (active
              ? "bg-[var(--color-brand-500)] text-white"
              : "bg-[var(--color-surface-soft)] text-[var(--color-brand-700)]")
          }
        >
          <Icon size={16} />
        </div>
        <div className="font-bold text-sm">{title}</div>
        {active && (
          <CheckCircle2 size={16} className="ml-auto text-[var(--color-brand-700)]" />
        )}
      </div>
      <div className="text-xs text-[var(--color-ink-2)] mt-1.5">{desc}</div>
      {warning && (
        <div className="text-[11px] text-[var(--color-danger)] mt-1 font-semibold">{warning}</div>
      )}
    </button>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between text-sm ${
        muted ? "text-[var(--color-ink-2)]" : "text-[var(--color-ink)]"
      }`}
    >
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
