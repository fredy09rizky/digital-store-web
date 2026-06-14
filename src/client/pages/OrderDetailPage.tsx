import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  RefreshCw,
  MessageCircle,
  Receipt,
  Star,
  RotateCcw,
  X,
  Sparkles,
  Eye,
  EyeOff,
  Copy,
  Check,
  Image as ImageIcon,
  CreditCardIcon,
} from "lucide-react";
import { api } from "../lib/api";
import type { OrderDetail, OrderStatus } from "@shared/types";
import { rupiah, dateID } from "../lib/format";
import { useToast } from "../components/Toast";
import { Loading } from "../components/Loading";
import { Button, IconButton, LinkButton } from "../components/Button";
import { useBackdropClose, useModalEffects } from "../lib/hooks";

const STATUS_INFO: Record<
  OrderStatus,
  {
    label: string;
    cls: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }
> = {
  pending_payment: { label: "Menunggu", icon: Clock, cls: "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_32%,transparent)]" },
  paid: { label: "Lunas", icon: CheckCircle2, cls: "bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)] border-[color-mix(in_srgb,var(--color-success)_32%,transparent)]" },
  expired: { label: "Kedaluwarsa", icon: XCircle, cls: "bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)] border-[color-mix(in_srgb,var(--color-danger)_32%,transparent)]" },
  cancelled: { label: "Dibatalkan", icon: Ban, cls: "bg-[var(--color-surface-mute)] text-[var(--color-ink-2)] border-[var(--color-border)]" },
  refunded: { label: "Direfund", icon: RefreshCw, cls: "bg-[var(--color-surface-tint)] text-[var(--color-brand-700)] border-[var(--color-brand-200)]" },
};

export default function OrderDetailPage() {
  const { idOrCode } = useParams();
  const nav = useNavigate();
  const [o, setO] = useState<OrderDetail | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundInfoOpen, setRefundInfoOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewState, setReviewState] = useState<{
    open: boolean;
    productId: string | null;
    productName: string | null;
  }>({ open: false, productId: null, productName: null });
  const toast = useToast();

  async function load() {
    setO(await api<OrderDetail>(`/orders/${idOrCode}`));
  }

  useEffect(() => {
    load();
  }, [idOrCode]);

  if (!o) return <Loading label="Memuat detail order…" />;
  const info = STATUS_INFO[o.status];
  const Icon = info.icon;

  async function submitRefund() {
    if (refundReason.trim().length < 5) {
      toast.error("Alasan minimal 5 karakter.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await api(`/account/refund-request`, {
        body: { orderId: o!.id, reason: refundReason.trim() },
      });
      setRefundOpen(false);
      toast.success("Permintaan refund terkirim ke admin.");
      // Chat refund baru saja dibuat → arahkan ke ruang chat.
      nav(`/akun/pesanan/${o!.code}/chat`);
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal mengirim refund.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-[var(--color-ink-2)]">
        <Link
          to="/akun/pesanan"
          className="inline-flex items-center gap-1 hover:text-[var(--color-brand-700)] font-semibold"
        >
          <ArrowLeft size={14} /> Daftar pesanan
        </Link>
        <span>{dateID(o.createdAt)}</span>
      </div>

      {/* Order summary card */}
      <div className="card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)]">
              Order
            </div>
            <div
              className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)] select-all"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {o.code}
            </div>
          </div>
          <span
            className={
              "text-[11px] font-bold uppercase tracking-wider border rounded-full px-3 py-1 inline-flex items-center gap-1.5 " +
              info.cls
            }
          >
            <Icon size={12} />
            {info.label}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
          <Stat icon={CreditCard} label="Metode" value={methodLabel(o.paymentMethod)} />
          <Stat icon={Receipt} label="Total" value={rupiah(o.totalCents)} highlight />
          <Stat icon={Calendar} label="Dibayar" value={o.paidAt ? dateID(o.paidAt, { dateStyle: "short", timeStyle: "short" }) : "-"} />
        </div>

        {/* Items */}
        <div className="mt-5">
          <div className="font-bold text-sm text-[var(--color-ink)] mb-2 inline-flex items-center gap-2">
            <Package size={14} className="text-[var(--color-brand-700)]" /> Item
          </div>
          <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] overflow-hidden">
            {o.items.map((it) => (
              <li
                key={it.id}
                className="px-3 py-2.5 flex items-center justify-between text-sm bg-[var(--color-surface)]"
              >
                <span className="text-[var(--color-ink)]">
                  <span className="font-bold mr-1">{it.qty}×</span>
                  {it.productName}
                </span>
                <span
                  className="font-bold text-[var(--color-ink)]"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {rupiah(it.subtotalCents)}
                </span>
              </li>
            ))}
          </ul>
          {o.notes && (
            <div className="text-xs text-[var(--color-ink-2)] mt-2 bg-[var(--color-surface-soft)] border border-[var(--color-border)] rounded-md p-2.5">
              <span className="font-bold">Catatan:</span> {o.notes}
            </div>
          )}
        </div>

        {/* Delivered accounts */}
        {o.deliveredItems.length > 0 && (
          <div className="mt-5">
            <div className="font-bold text-sm text-[var(--color-ink)] mb-2 inline-flex items-center gap-2">
              <Sparkles size={14} className="text-[var(--color-accent-500)]" /> Akun terkirim
            </div>
            <ul className="space-y-2">
              {o.deliveredItems.map((d) => (
                <DeliveredItem
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
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex flex-wrap gap-2">
          {o.status === "pending_payment" && (
            <LinkButton to={`/pembayaran/${o.code}`} icon={CreditCardIcon}>
              Lanjutkan pembayaran
            </LinkButton>
          )}
          {o.status === "paid" && (
            <LinkButton to={`/akun/pesanan/${o.code}/invoice`} variant="outline" icon={Receipt}>
              Unduh invoice
            </LinkButton>
          )}
          {/* Refund: hanya untuk order pembelian yang sudah lunas.
              - Belum pernah diajukan → buka form.
              - Sudah diajukan & chat masih ada → masuk ke chat refund.
              - Sudah diajukan & chat sudah ditutup/dihapus → info popup. */}
          {o.status === "paid" &&
            o.kind !== "topup" &&
            (!o.refundRequestedAt ? (
              <Button variant="ghost" icon={RotateCcw} onClick={() => setRefundOpen(true)}>
                Ajukan refund
              </Button>
            ) : o.refundChat ? (
              <LinkButton
                to={`/akun/pesanan/${o.code}/chat`}
                variant="outline"
                icon={MessageCircle}
              >
                Lihat chat refund
              </LinkButton>
            ) : (
              <Button variant="ghost" icon={RotateCcw} onClick={() => setRefundInfoOpen(true)}>
                Status refund
              </Button>
            ))}
          {o.reviewable
            .filter((r) => !r.reviewed)
            .map((r) => (
              <Button
                key={r.productId}
                variant="outline"
                icon={Star}
                onClick={() =>
                  setReviewState({ open: true, productId: r.productId, productName: r.productName })
                }
              >
                Review {r.productName}
              </Button>
            ))}
        </div>
      </div>

      {refundOpen && (
        <Modal onClose={() => setRefundOpen(false)} title="Ajukan refund" icon={RotateCcw}>
          <p className="text-sm text-[var(--color-ink-2)] mb-3">
            Refund hanya bisa diajukan <span className="font-semibold">satu kali</span> per pesanan.
            Permintaan diteruskan ke admin lewat chat refund. Refund yang disetujui masuk ke saldo
            akun.
          </p>
          <textarea
            className="textarea"
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
            placeholder="Jelaskan alasan refund secara singkat dan jelas (5-500 karakter)."
            maxLength={500}
          />
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="ghost" onClick={() => setRefundOpen(false)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={submitRefund} icon={MessageCircle} loading={submitting}>
              Kirim ke admin
            </Button>
          </div>
        </Modal>
      )}
      {refundInfoOpen && (
        <Modal onClose={() => setRefundInfoOpen(false)} title="Refund tidak bisa diajukan lagi" icon={RotateCcw}>
          <p className="text-sm text-[var(--color-ink-2)] mb-4">
            Refund untuk pesanan ini sudah pernah diajukan sebelumnya dan sesi chatnya sudah ditutup
            admin. Permintaan refund baru tidak bisa dilakukan untuk pesanan yang sama. Jika masih
            ada kendala lain, gunakan menu <span className="font-semibold">Bantuan</span> di akun.
          </p>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setRefundInfoOpen(false)}>
              Mengerti
            </Button>
          </div>
        </Modal>
      )}
      {reviewState.open && reviewState.productId && (
        <ReviewModal
          orderId={o.id}
          productId={reviewState.productId}
          productName={reviewState.productName ?? ""}
          onClose={() => setReviewState({ open: false, productId: null, productName: null })}
          onDone={() => {
            setReviewState({ open: false, productId: null, productName: null });
            load();
          }}
        />
      )}
    </div>
  );
}

function methodLabel(m: string): string {
  if (m === "qris") return "QRIS";
  if (m === "wallet") return "Saldo";
  if (m === "bank_transfer") return "Transfer Bank";
  return m;
}

function Stat({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border p-3 " +
        (highlight
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
          (highlight ? "text-[var(--color-brand-700)]" : "text-[var(--color-ink)]")
        }
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {value}
      </div>
    </div>
  );
}

function DeliveredItem({
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
    <li className="rounded-lg bg-[var(--color-surface-soft)] border border-[var(--color-border)] p-3">
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
    <div className="rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] p-2.5">
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
            size={13}
            className="!size-7"
            onClick={() => setShow((v) => !v)}
          />
        )}
        <IconButton
          icon={copied ? Check : Copy}
          label={copied ? "Disalin" : "Salin"}
          size={13}
          className={"!size-7 " + (copied ? "!text-[var(--color-success)]" : "")}
          onClick={copy}
        />
      </div>
    </div>
  );
}

function Modal({
  children,
  title,
  icon: Icon,
  onClose,
}: {
  children: React.ReactNode;
  title: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  onClose: () => void;
}) {
  useModalEffects(true, onClose);
  const onBackdropClick = useBackdropClose(onClose);
  return (
    <div
      className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4 animate-fade-in"
      onMouseDown={onBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card max-w-md w-full p-5 sm:p-6 my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto animate-scale-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div className="size-9 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
                <Icon size={18} />
              </div>
            )}
            <div className="font-extrabold text-lg text-[var(--color-ink)]">{title}</div>
          </div>
          <IconButton icon={X} label="Tutup" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

function ReviewModal({
  orderId,
  productId,
  productName,
  onClose,
  onDone,
}: {
  orderId: string;
  productId: string;
  productName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function uploadImg(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (imageUrls.length >= 2) return toast.error("Maksimal 2 foto.");
    if (f.size > 2 * 1024 * 1024) return toast.error("Maks 2MB per foto.");
    const fd = new FormData();
    fd.append("file", f);
    fd.append("folder", "reviews");
    try {
      const up = await api<{ url: string }>("/upload", { formData: fd });
      setImageUrls((s) => [...s, up.url]);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload gagal.");
    }
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      await api("/account/reviews", {
        body: { orderId, productId, rating, comment, imageUrls },
      });
      toast.success("Review terkirim. Menunggu moderasi admin.");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal kirim review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} title={`Review · ${productName}`} icon={Star}>
      <div className="space-y-3">
        <div>
          <div className="label !mb-2">Rating</div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className="size-9 grid place-items-center rounded-md hover:bg-[var(--color-surface-soft)] transition"
                aria-label={`${n} bintang`}
              >
                <Star
                  size={22}
                  className={
                    n <= rating
                      ? "fill-amber-400 stroke-amber-400"
                      : "stroke-[var(--color-ink-3)] fill-transparent"
                  }
                />
              </button>
            ))}
            <span className="ml-2 text-sm font-bold text-[var(--color-ink)]">{rating}/5</span>
          </div>
        </div>
        <div>
          <label className="label">Komentar (opsional)</label>
          <textarea
            className="textarea"
            placeholder="Ceritakan pengalamanmu pakai produk ini."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
          />
        </div>
        <div>
          <label className="label">Foto (opsional, maks 2)</label>
          <input
            type="file"
            accept="image/*"
            onChange={uploadImg}
            disabled={imageUrls.length >= 2}
            className="block w-full text-sm text-[var(--color-ink-2)] file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:uppercase file:tracking-wider file:bg-[var(--color-brand-500)] file:text-white hover:file:bg-[var(--color-brand-700)] file:cursor-pointer disabled:opacity-50"
          />
          {imageUrls.length > 0 && (
            <div className="flex gap-2 mt-2">
              {imageUrls.map((u) => (
                <div key={u} className="relative">
                  <img
                    src={u}
                    className="size-20 object-cover rounded-lg border border-[var(--color-border)]"
                    alt="Foto review"
                  />
                  <button
                    className="absolute -top-2 -right-2 size-6 grid place-items-center rounded-full bg-[var(--color-danger)] text-white shadow"
                    onClick={() => setImageUrls((arr) => arr.filter((x) => x !== u))}
                    aria-label="Hapus foto"
                    type="button"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {imageUrls.length === 0 && (
            <p className="text-xs text-[var(--color-ink-3)] mt-1.5 inline-flex items-center gap-1">
              <ImageIcon size={11} /> jpg / png / webp · maks 2MB per foto
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2 justify-end mt-5">
        <Button variant="ghost" onClick={onClose}>
          Batal
        </Button>
        <Button onClick={submit} loading={busy} icon={Star}>
          Kirim review
        </Button>
      </div>
    </Modal>
  );
}
