import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  QrCode,
  RefreshCw,
  Building2,
  Wallet,
  AlertTriangle,
  Copy,
  Check,
  Upload,
  ImageIcon,
  Clock,
  ArrowRight,
  Receipt,
  ShieldCheck,
  Beaker,
  CreditCard,
} from "lucide-react";
import QRCode from "qrcode";
import { api } from "../lib/api";
import type { OrderDetail } from "@shared/types";
import { rupiah, countdown } from "../lib/format";
import { useToast } from "../components/Toast";
import { useApp } from "../state/AppProviders";
import { Loading } from "../components/Loading";
import { Button, LinkButton } from "../components/Button";
import { StatusPill } from "../components/StatusPill";

interface CheckResp {
  order: OrderDetail;
  throttled: boolean;
}

export default function PaymentPage() {
  const { idOrCode } = useParams();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [manualCooldownEnd, setManualCooldownEnd] = useState(0);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const nav = useNavigate();
  const { boot } = useApp();

  async function load() {
    try {
      const o = await api<OrderDetail>(`/orders/${idOrCode}`);
      setOrder(o);
      if (o.status === "paid") nav(`/sukses/${o.code}`, { replace: true });
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    load();
  }, [idOrCode]);

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const secondsLeft = order ? Math.max(0, order.expiresAt - now) : 0;
  const expired = order && (order.status === "expired" || secondsLeft <= 0);
  const isPending = order?.status === "pending_payment";

  // Tier interval auto-poll: 30s default, 10s saat <=60s, 5s saat <=20s.
  // Disimpan di ref supaya scheduler timeout selalu baca tier terbaru tanpa
  // memaksa re-mount efek setiap detik (yang tadi membatalkan polling).
  const intervalTier =
    secondsLeft <= 20 ? 5000 : secondsLeft <= 60 ? 10000 : 30000;
  const tierRef = useRef(intervalTier);
  useEffect(() => {
    tierRef.current = intervalTier;
  }, [intervalTier]);

  // Auto-poll adaptif. Pakai setTimeout rekursif, bukan setInterval, supaya
  // interval bisa berubah dinamis dan tidak ada timer yang ditumpuk saat
  // request masih in-flight.
  useEffect(() => {
    if (!isPending || !idOrCode) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const r = await api<CheckResp>(`/orders/${idOrCode}/check-status`, {
          body: {},
        });
        if (cancelled) return;
        setOrder(r.order);
        if (r.order.status === "paid") {
          nav(`/sukses/${r.order.code}`, { replace: true });
          return;
        }
        if (r.order.status === "expired") return;
      } catch {
        // diam: lanjutkan polling berikutnya.
      }
      if (cancelled) return;
      timer = setTimeout(tick, tierRef.current);
    };

    // Polling pertama dijalankan setelah 2 detik agar user tidak menunggu
    // tier penuh (30s) untuk hit pertama.
    timer = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isPending, idOrCode, nav]);

  const manualDisabled = useMemo(() => {
    if (!order || order.status !== "pending_payment") return true;
    return now < manualCooldownEnd || secondsLeft <= 15;
  }, [order, now, manualCooldownEnd, secondsLeft]);
  const manualCooldownLeft = Math.max(0, manualCooldownEnd - now);

  async function manualCheck() {
    if (manualDisabled) return;
    setBusy(true);
    try {
      const r = await api<CheckResp>(`/orders/${idOrCode}/check-status`, { body: {} });
      setOrder(r.order);
      if (r.order.status === "paid") nav(`/sukses/${r.order.code}`, { replace: true });
      else toast.info("Status pembayaran masih menunggu.");
    } finally {
      setManualCooldownEnd(Math.floor(Date.now() / 1000) + 10);
      setBusy(false);
    }
  }

  if (!order) return <Loading label="Memuat detail pembayaran…" />;

  const isTopUp = order.kind === "topup";

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      <div className="space-y-4 min-w-0">
        {/* Header card */}
        <div className="card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)]">
                {isTopUp ? "Top up saldo" : "Order"}
              </div>
              <div
                className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)] mt-0.5 select-all"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {order.code}
              </div>
            </div>
            <StatusPill status={order.status} />
          </div>

          {isPending && (
            <div className="mt-6">
              <CircularCountdown
                secondsLeft={secondsLeft}
                totalSeconds={Math.max(60, order.expiresAt - order.createdAt)}
              />
            </div>
          )}
          {expired && (
            <div className="mt-4 rounded-xl bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-danger)_32%,transparent)] text-[var(--color-danger)] p-4 text-sm flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-bold">Order sudah kedaluwarsa</div>
                <div className="text-xs mt-1 text-[var(--color-danger)]">
                  Stok sudah dilepas otomatis. Silakan buat order baru dari keranjang.
                </div>
              </div>
            </div>
          )}

          {/* Payment panel */}
          <div className="mt-5">
            {order.payment?.method === "qris" && (
              <QrisPanel
                payload={order.payment.qrPayload}
                amountCents={order.payment.displayAmountCents ?? order.totalCents}
                feeCents={order.payment.feeCents ?? 0}
                baseAmountCents={order.totalCents}
              />
            )}
            {order.payment?.method === "bank_transfer" && (
              <BankPanel
                bankName={order.payment.bankName}
                bankAccount={order.payment.bankAccount}
                bankHolder={order.payment.bankHolder}
                amountCents={order.payment.displayAmountCents ?? order.totalCents}
                feeCents={order.payment.feeCents ?? 0}
                baseAmountCents={order.totalCents}
                proofUrl={order.payment.proofUrl}
                idOrCode={order.code}
                note={boot?.manualBank?.note}
                onUploaded={(u) =>
                  setOrder({ ...order, payment: { ...order.payment!, proofUrl: u } })
                }
              />
            )}
            {order.payment?.method === "wallet" && (
              <div className="rounded-xl bg-[var(--color-surface-tint)] border border-[var(--color-brand-200)] p-4 text-sm flex items-start gap-3">
                <Wallet size={18} className="text-[var(--color-brand-700)] mt-0.5" />
                <div className="text-[var(--color-ink)]">
                  Pembayaran dengan saldo. Status seharusnya langsung sukses. Klik tombol cek di
                  bawah jika belum diteruskan.
                </div>
              </div>
            )}
          </div>

          {/* Action row */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              icon={RefreshCw}
              onClick={manualCheck}
              disabled={manualDisabled || busy}
              loading={busy}
            >
              {busy
                ? "Memeriksa…"
                : manualCooldownLeft > 0
                  ? `Tunggu ${manualCooldownLeft}s…`
                  : "Cek status sekarang"}
            </Button>
            {import.meta.env.DEV && order.status === "pending_payment" && (
              <Button
                variant="ghost"
                icon={Beaker}
                onClick={async () => {
                  await api(`/orders/${order.code}/simulate-paid`, { body: {} }).catch(() => null);
                  load();
                }}
              >
                (DEV) Simulasikan paid
              </Button>
            )}
          </div>
        </div>

        {/* Tips */}
        {isPending && (
          <div className="card p-4 sm:p-5 bg-[var(--color-surface-tint)] border-[var(--color-brand-200)]">
            <div className="flex items-start gap-3">
              <ShieldCheck size={18} className="text-[var(--color-brand-700)] mt-0.5 shrink-0" />
              <div className="text-xs sm:text-sm text-[var(--color-ink)] leading-relaxed">
                <div className="font-bold">Tips aman</div>
                <div className="text-[var(--color-ink-2)] mt-1">
                  Pastikan nominal yang muncul di e-wallet kamu persis sama. Sistem akan otomatis
                  meneruskan order saat pembayaran terkonfirmasi—tidak perlu refresh.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary aside */}
      <aside className="card p-5 space-y-2 h-fit lg:sticky lg:top-20">
        <div className="font-bold text-[var(--color-ink)] text-base inline-flex items-center gap-2">
          <Receipt size={16} className="text-[var(--color-brand-700)]" />
          Detail pembayaran
        </div>
        <Row
          label="Metode"
          value={methodLabel(order.paymentMethod)}
          icon={methodIcon(order.paymentMethod)}
        />
        <Row label="Subtotal" value={rupiah(order.subtotalCents)} muted />
        {order.discountCents > 0 && (
          <Row label="Diskon" value={`- ${rupiah(order.discountCents)}`} muted />
        )}
        {order.serviceFeeCents > 0 && (
          <Row label="Biaya layanan" value={rupiah(order.serviceFeeCents)} muted />
        )}
        <Row label="Total order" value={rupiah(order.totalCents)} muted />
        {order.payment?.feeCents ? (
          <Row label="Fee gateway" value={rupiah(order.payment.feeCents)} muted />
        ) : null}
        <div className="divider" />
        <Row
          label="Yang harus dibayar"
          value={rupiah(order.payment?.displayAmountCents ?? order.totalCents)}
          bold
        />
        <LinkButton
          to={`/akun/pesanan/${order.code}`}
          variant="ghost"
          iconRight={ArrowRight}
          block
          className="mt-2"
        >
          Lihat detail order
        </LinkButton>
      </aside>
    </div>
  );
}

function methodIcon(m: string) {
  if (m === "qris") return QrCode;
  if (m === "wallet") return Wallet;
  if (m === "bank_transfer") return Building2;
  return CreditCard;
}
function methodLabel(m: string): string {
  if (m === "qris") return "QRIS";
  if (m === "wallet") return "Saldo";
  if (m === "bank_transfer") return "Transfer Bank";
  return m;
}

/**
 * Cincin countdown melingkar dengan eskalasi warna. Memberi "storytelling"
 * visual ketimbang angka raksasa yang berdiri sendiri.
 */
function CircularCountdown({
  secondsLeft,
  totalSeconds,
}: {
  secondsLeft: number;
  totalSeconds: number;
}) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  const color =
    secondsLeft <= 30
      ? "var(--color-danger)"
      : secondsLeft <= 60
        ? "var(--color-accent-500)"
        : "var(--color-brand-500)";
  return (
    <div className="grid place-items-center">
      <div className="eyebrow inline-flex items-center gap-1.5">
        <Clock size={12} />
        Selesaikan pembayaran dalam
      </div>
      <div className="relative mt-3 size-40 grid place-items-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 128 128" aria-hidden>
          <circle cx="64" cy="64" r={r} fill="none" stroke="var(--color-surface-mute)" strokeWidth="9" />
          <circle
            cx="64"
            cy="64"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - frac)}
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.4s" }}
          />
        </svg>
        <div className="text-center">
          <div
            className="text-3xl font-black tabular-nums tracking-tight"
            style={{ fontFamily: "var(--font-ui)", color }}
          >
            {countdown(secondsLeft)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] mt-0.5">
            menit
          </div>
        </div>
      </div>
    </div>
  );
}

function QrisPanel({
  payload,
  amountCents,
  feeCents,
  baseAmountCents,
}: {
  payload: string | null;
  amountCents: number;
  feeCents: number;
  baseAmountCents: number;
}) {
  const [src, setSrc] = useState<string>("");
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!payload) {
      setSrc("");
      return;
    }
    setQrError(null);
    QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 480,
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch((err) => {
        if (!cancelled) setQrError(err?.message ?? "Gagal membuat QR.");
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  return (
    <div className="rounded-2xl bg-[var(--color-surface)] border-2 border-[var(--color-brand-200)] p-5 grid place-items-center">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-700)] inline-flex items-center gap-1.5">
        <QrCode size={12} /> Scan QRIS
      </div>
      {payload ? (
        <>
          <div className="mt-3 size-64 grid place-items-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl">
            {src ? (
              <img src={src} alt="QR pembayaran" className="size-60 object-contain" />
            ) : qrError ? (
              <div className="text-xs text-[var(--color-danger)] px-4 text-center">{qrError}</div>
            ) : (
              <div className="text-[var(--color-ink-3)] text-sm">Membuat QR…</div>
            )}
          </div>
          <div
            className="text-2xl sm:text-3xl font-extrabold tabular-nums mt-3 text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {rupiah(amountCents)}
          </div>
          {feeCents > 0 && (
            <div className="text-xs text-[var(--color-ink-3)] mt-1 text-center">
              Termasuk biaya gateway {rupiah(feeCents)} (subtotal {rupiah(baseAmountCents)})
            </div>
          )}
          <div className="mt-3 text-xs text-[var(--color-ink-2)] inline-flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-[var(--color-success)]" /> Bisa dibuka di GoPay, OVO, Dana,
            ShopeePay, semua m-banking
          </div>
        </>
      ) : (
        <div className="py-12 text-[var(--color-ink-3)] text-sm">Memuat QR…</div>
      )}
    </div>
  );
}

function BankPanel({
  bankName,
  bankAccount,
  bankHolder,
  amountCents,
  feeCents,
  baseAmountCents,
  proofUrl,
  idOrCode,
  onUploaded,
  note,
}: {
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  amountCents: number;
  feeCents: number;
  baseAmountCents: number;
  proofUrl: string | null;
  idOrCode: string;
  onUploaded: (u: string) => void;
  note?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [copiedField, setCopiedField] = useState<"acc" | "amt" | null>(null);
  const toast = useToast();

  async function copy(value: string, field: "acc" | "amt") {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      toast.error("Tidak bisa menyalin.");
    }
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("folder", "proofs");
      const up = await api<{ url: string }>("/upload", { formData: fd });
      await api(`/orders/${idOrCode}/upload-proof`, { body: { proofUrl: up.url } });
      onUploaded(up.url);
      toast.success("Bukti transfer terkirim. Admin akan memverifikasi.");
    } catch (er: any) {
      toast.error(er?.message ?? "Upload gagal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border-2 border-[var(--color-brand-200)] overflow-hidden">
        <div className="bg-[var(--color-brand-500)] text-white px-4 py-2.5 flex items-center justify-between">
          <div className="font-bold inline-flex items-center gap-2">
            <Building2 size={16} />
            {bankName ?? "Transfer Bank"}
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-90">
            Manual
          </span>
        </div>
        <div className="bg-[var(--color-surface)] p-4 space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)]">
              Nomor rekening
            </div>
            <div className="flex items-center justify-between gap-2 mt-1">
              <div
                className="font-extrabold text-xl tracking-wider text-[var(--color-ink)] select-all"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {bankAccount}
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={copiedField === "acc" ? Check : Copy}
                onClick={() => copy(bankAccount ?? "", "acc")}
              >
                {copiedField === "acc" ? "Disalin" : "Salin"}
              </Button>
            </div>
            <div className="text-xs text-[var(--color-ink-2)] mt-1">a.n. {bankHolder}</div>
          </div>
          <div className="divider" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)]">
                Nominal transfer
              </div>
              <div
                className="font-extrabold text-xl text-[var(--color-ink)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {rupiah(amountCents)}
              </div>
              {feeCents > 0 && (
                <div className="text-[11px] text-[var(--color-ink-3)]">
                  Termasuk fee {rupiah(feeCents)} · subtotal {rupiah(baseAmountCents)}
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={copiedField === "amt" ? Check : Copy}
              onClick={() => copy(String(amountCents), "amt")}
            >
              {copiedField === "amt" ? "Disalin" : "Salin"}
            </Button>
          </div>
        </div>
      </div>

      {note && (
        <div className="rounded-lg bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] border border-[color-mix(in_srgb,var(--color-warning)_32%,transparent)] text-[var(--color-warning)] text-xs p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {note}
        </div>
      )}

      <div className="card p-4 space-y-2">
        <div className="font-bold text-sm text-[var(--color-ink)] inline-flex items-center gap-2">
          <Upload size={15} className="text-[var(--color-brand-700)]" />
          Upload bukti transfer
        </div>
        <p className="text-xs text-[var(--color-ink-2)]">
          jpg / png / webp, maks 2MB. Admin akan verifikasi dan menandai paid.
        </p>
        <label className="block">
          <input
            type="file"
            accept="image/*"
            onChange={upload}
            disabled={busy}
            className="block w-full text-sm text-[var(--color-ink-2)] file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:uppercase file:tracking-wider file:bg-[var(--color-brand-500)] file:text-white hover:file:bg-[var(--color-brand-700)] file:cursor-pointer disabled:opacity-50"
          />
        </label>
        {proofUrl && (
          <div className="mt-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)] inline-flex items-center gap-1.5 mb-1">
              <ImageIcon size={12} /> Bukti tersimpan
            </div>
            <img
              src={proofUrl}
              className="max-h-44 rounded-lg border border-[var(--color-border)]"
              alt="Bukti transfer"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
  icon: Icon,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div
      className={`flex items-center justify-between text-sm ${
        muted ? "text-[var(--color-ink-2)]" : "text-[var(--color-ink)]"
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        {Icon && <Icon size={13} className="text-[var(--color-ink-3)]" />}
        {label}
      </span>
      <span
        className={bold ? "text-lg font-extrabold text-[var(--color-ink)]" : "font-semibold"}
        style={bold ? { fontFamily: "var(--font-ui)" } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
