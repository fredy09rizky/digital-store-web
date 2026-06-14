import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CheckCircle2,
  Wallet,
  Receipt,
  User,
  Check,
  Calendar,
  CreditCard,
  Tag,
  Package,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import { api } from "../lib/api";
import type { OrderDetail } from "@shared/types";
import { rupiah, dateID } from "../lib/format";
import { useApp } from "../state/AppProviders";
import { Loading } from "../components/Loading";
import { LinkButton } from "../components/Button";

export default function OrderSuccessPage() {
  const { idOrCode } = useParams();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const { refreshBoot } = useApp();

  useEffect(() => {
    api<OrderDetail>(`/orders/${idOrCode}`)
      .then(setOrder)
      .catch(() => null);
    // Saldo di header (boot.user.balanceCents) berubah setelah top up sukses
    // atau checkout pakai saldo. Saat sampai di halaman ini, kredit/debit
    // sudah dikomit server-side, jadi segarkan boot agar header langsung
    // sinkron (tidak menunggu reload/login ulang).
    refreshBoot();
  }, [idOrCode, refreshBoot]);

  if (!order) return <Loading label="Memuat detail order…" />;
  const isTopUp = order.kind === "topup";

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
      {/* Hero success */}
      <div className="card p-6 sm:p-8 text-center relative overflow-hidden">
        <div className="absolute inset-x-0 -top-20 h-40 bg-gradient-to-b from-[color-mix(in_srgb,var(--color-success)_28%,transparent)] via-[color-mix(in_srgb,var(--color-success)_10%,transparent)] to-transparent" />
        <div className="relative">
          <div className="mx-auto size-16 sm:size-20 rounded-full bg-[var(--color-success)] grid place-items-center text-white mb-3 ring-8 ring-[color-mix(in_srgb,var(--color-success)_20%,transparent)]">
            <Check size={32} strokeWidth={3} />
          </div>
          <h1
            className="text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {isTopUp ? "Top up berhasil" : "Pembayaran sukses"}
          </h1>
          <p className="text-[var(--color-ink-2)] mt-1.5">
            Order{" "}
            <span
              className="font-bold text-[var(--color-ink)] select-all"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {order.code}
            </span>{" "}
            sudah lunas.
          </p>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-left">
            <Stat icon={Calendar} label="Tanggal" value={dateID(order.paidAt ?? order.createdAt)} />
            <Stat icon={CreditCard} label="Metode" value={methodLabel(order.paymentMethod)} />
            <Stat icon={Tag} label="Total" value={rupiah(order.totalCents)} highlight />
            <Stat icon={CheckCircle2} label="Status" value="LUNAS" success />
          </div>
        </div>
      </div>

      {/* Top-up note */}
      {isTopUp && (
        <div className="card p-5 bg-[var(--color-surface-tint)] border-[var(--color-brand-200)] flex items-start gap-3">
          <Wallet size={22} className="text-[var(--color-brand-700)] shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-[var(--color-ink)]">Saldo sudah masuk</div>
            <div className="text-sm text-[var(--color-ink-2)] mt-0.5">
              Total {rupiah(order.totalCents)} sudah masuk ke saldo akunmu dan siap dipakai untuk
              checkout berikutnya.
            </div>
          </div>
        </div>
      )}

      {/* Ringkasan pesanan */}
      {!isTopUp && (
        <div className="card p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="size-8 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
              <Receipt size={16} />
            </div>
            <div className="font-bold text-[var(--color-ink)]">Ringkasan pesanan</div>
          </div>
          <ul className="divide-y divide-[var(--color-border)]">
            {order.items.map((it) => (
              <li key={it.id} className="py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-[var(--color-ink)] line-clamp-1">
                    {it.productName}
                  </div>
                  <div className="text-xs text-[var(--color-ink-2)]">
                    {it.qty} × {rupiah(it.unitPriceCents)}
                  </div>
                </div>
                <div
                  className="font-bold text-sm text-[var(--color-ink)] tabular-nums"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {rupiah(it.subtotalCents)}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1.5 text-sm border-t border-[var(--color-border)] pt-3">
            <SummaryRow label="Subtotal" value={rupiah(order.subtotalCents)} />
            {order.discountCents > 0 && (
              <SummaryRow label="Diskon" value={`- ${rupiah(order.discountCents)}`} muted />
            )}
            {order.serviceFeeCents > 0 && (
              <SummaryRow label="Biaya layanan" value={rupiah(order.serviceFeeCents)} muted />
            )}
            <SummaryRow label="Total" value={rupiah(order.totalCents)} bold />
          </div>
        </div>
      )}

      {/* Akun: tidak ditampilkan di sini demi keamanan, arahkan ke detail pesanan */}
      {!isTopUp && order.deliveredItems.length > 0 && (
        <div className="card p-5 bg-[var(--color-surface-tint)] border-[var(--color-brand-200)] flex items-start gap-3">
          <ShieldCheck size={22} className="text-[var(--color-brand-700)] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="font-bold text-[var(--color-ink)]">
              Akun siap diambil ({order.deliveredItems.length})
            </div>
            <div className="text-sm text-[var(--color-ink-2)] mt-0.5">
              Demi keamanan, detail akun tidak ditampilkan di halaman ini. Buka detail pesanan untuk
              melihat dan menyalin kredensial akunmu.
            </div>
            <LinkButton
              to={`/akun/pesanan/${order.code}`}
              variant="outline"
              size="sm"
              icon={KeyRound}
              className="mt-2"
            >
              Lihat akun di detail pesanan
            </LinkButton>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="grid sm:grid-cols-2 gap-2">
        <LinkButton to="/akun" variant="outline" icon={User} block>
          {isTopUp ? "Ke akun saya" : "Lihat akun saya"}
        </LinkButton>
        {isTopUp ? (
          <LinkButton to="/katalog" icon={Package} block>
            Belanja sekarang
          </LinkButton>
        ) : (
          <LinkButton to={`/akun/pesanan/${order.code}/invoice`} icon={Receipt} block>
            Unduh invoice
          </LinkButton>
        )}
      </div>
    </div>
  );
}

function methodLabel(m: string): string {
  if (m === "qris") return "QRIS";
  if (m === "wallet") return "Saldo";
  if (m === "bank_transfer") return "Transfer";
  return m;
}

function Stat({
  icon: Icon,
  label,
  value,
  highlight,
  success,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  highlight?: boolean;
  success?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border p-3 " +
        (success
          ? "bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] border-[color-mix(in_srgb,var(--color-success)_32%,transparent)]"
          : highlight
            ? "bg-[var(--color-surface-tint)] border-[var(--color-brand-200)]"
            : "bg-[var(--color-surface)] border-[var(--color-border)]")
      }
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)] inline-flex items-center gap-1">
        <Icon size={11} />
        {label}
      </div>
      <div
        className={
          "font-extrabold text-sm mt-0.5 " +
          (success
            ? "text-[var(--color-success)]"
            : highlight
              ? "text-[var(--color-brand-700)]"
              : "text-[var(--color-ink)]")
        }
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {value}
      </div>
    </div>
  );
}

function SummaryRow({
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
      className={
        "flex items-center justify-between " +
        (muted ? "text-[var(--color-ink-2)]" : "text-[var(--color-ink)]")
      }
    >
      <span>{label}</span>
      <span
        className={
          bold
            ? "font-extrabold text-base text-[var(--color-ink)] tabular-nums"
            : "font-semibold tabular-nums"
        }
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {value}
      </span>
    </div>
  );
}
