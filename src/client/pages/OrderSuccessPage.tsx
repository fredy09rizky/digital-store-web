import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CheckCircle2,
  Wallet,
  Receipt,
  User,
  Sparkles,
  Copy,
  Check,
  Eye,
  EyeOff,
  Calendar,
  CreditCard,
  Tag,
  Package,
} from "lucide-react";
import { api } from "../lib/api";
import type { OrderDetail } from "@shared/types";
import { rupiah, dateID } from "../lib/format";
import { useApp } from "../state/AppProviders";
import { Loading } from "../components/Loading";
import { LinkButton, IconButton } from "../components/Button";
import { useToast } from "../components/Toast";

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
  const isTopUp = order.notes === "Top up saldo";

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
            <Stat icon={Calendar} label="Tanggal" value={dateID(order.paidAt ?? order.createdAt, { dateStyle: "medium" })} />
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

      {/* Delivered accounts */}
      {!isTopUp && order.deliveredItems.length > 0 && (
        <div className="card p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="size-8 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
              <Sparkles size={16} />
            </div>
            <div className="font-bold text-[var(--color-ink)]">
              Akun kamu ({order.deliveredItems.length})
            </div>
          </div>
          <ul className="space-y-3">
            {order.deliveredItems.map((d) => (
              <DeliveredItemCard
                key={d.id}
                productName={d.productName}
                email={d.payloadEmail}
                password={d.payloadPassword}
                note={d.payloadNote}
                expiry={d.payloadExpiry}
                extra={d.payloadExtra}
              />
            ))}
          </ul>
          <p className="text-xs text-[var(--color-ink-3)] mt-3 leading-relaxed">
            Catat akun di tempat aman. Kamu juga bisa melihatnya kapan saja di halaman pesanan dan
            unduh sebagai invoice.
          </p>
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

function DeliveredItemCard({
  productName,
  email,
  password,
  note,
  expiry,
  extra,
}: {
  productName: string;
  email: string;
  password: string;
  note: string | null;
  expiry: string | null;
  extra: string | null;
}) {
  return (
    <li className="rounded-xl bg-[var(--color-surface-soft)] border border-[var(--color-border)] p-3 sm:p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-700)] mb-2">
        {productName}
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <CredField label="Email / Akun" value={email} mono />
        <CredField label="Password" value={password} mono secret />
        {note && <CredField label="Catatan" value={note} />}
        {expiry && <CredField label="Expired" value={expiry} />}
        {extra && <CredField label="Tambahan" value={extra} />}
      </div>
    </li>
  );
}

function CredField({
  label,
  value,
  mono,
  secret,
}: {
  label: string;
  value: string;
  mono?: boolean;
  secret?: boolean;
}) {
  const [show, setShow] = useState(!secret);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Tidak bisa menyalin.");
    }
  }

  return (
    <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)]">
        {label}
      </div>
      <div className="flex items-center gap-1 mt-1">
        <div
          className={
            "text-sm flex-1 min-w-0 break-all text-[var(--color-ink)] " +
            (mono ? "font-mono" : "")
          }
        >
          {show ? value : "••••••••••"}
        </div>
        {secret && (
          <IconButton
            icon={show ? EyeOff : Eye}
            label={show ? "Sembunyikan" : "Tampilkan"}
            size={14}
            className="!size-7"
            onClick={() => setShow((v) => !v)}
          />
        )}
        <IconButton
          icon={copied ? Check : Copy}
          label={copied ? "Disalin" : "Salin"}
          size={14}
          className={"!size-7 " + (copied ? "!text-[var(--color-success)]" : "")}
          onClick={copy}
        />
      </div>
    </div>
  );
}
