import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  Package,
  MessageCircle,
  Receipt,
  Star,
  RotateCcw,
  Sparkles,
  Eye,
  EyeOff,
  Copy,
  Check,
  CreditCardIcon,
} from "lucide-react";
import { api } from "../lib/api";
import type { OrderDetail } from "@shared/types";
import { rupiah, dateID } from "../lib/format";
import { useToast } from "../components/Toast";
import { Loading } from "../components/Loading";
import { Button, IconButton, LinkButton } from "../components/Button";
import { Modal } from "../components/Modal";
import { StatusPill } from "../components/StatusPill";

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
          <StatusPill status={o.status} className="!text-[11px] !px-3 !py-1" />
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
                <DeliveredItem key={d.id} item={d} />
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

      <Modal open={refundOpen} onClose={() => setRefundOpen(false)} title="Ajukan refund" icon={RotateCcw}>
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
      <Modal open={refundInfoOpen} onClose={() => setRefundInfoOpen(false)} title="Refund tidak bisa diajukan lagi" icon={RotateCcw}>
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

function DeliveredItem({ item }: { item: OrderDetail["deliveredItems"][number] }) {
  return (
    <li className="rounded-lg bg-[var(--color-surface-soft)] border border-[var(--color-border)] p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-700)] mb-2">
        {item.productName}
      </div>
      <ContentField value={item.content} />
    </li>
  );
}

// Konten stok format bebas: ditampilkan apa adanya (verbatim). Disembunyikan
// default karena bisa memuat kredensial; tombol tampilkan + salin.
function ContentField({ value }: { value: string }) {
  const [show, setShow] = useState(false);
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
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)]">
          Data pesanan
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            icon={show ? EyeOff : Eye}
            label={show ? "Sembunyikan" : "Tampilkan"}
            size={13}
            className="!size-7"
            onClick={() => setShow((v) => !v)}
          />
          <IconButton
            icon={copied ? Check : Copy}
            label={copied ? "Disalin" : "Salin"}
            size={13}
            className={"!size-7 " + (copied ? "!text-[var(--color-success)]" : "")}
            onClick={copy}
          />
        </div>
      </div>
      {show ? (
        <pre className="text-sm whitespace-pre-wrap break-all font-mono text-[var(--color-ink)] max-h-80 overflow-auto">
          {value}
        </pre>
      ) : (
        <div className="text-sm font-mono text-[var(--color-ink-3)]">
          •••••••••• (klik ikon mata untuk menampilkan)
        </div>
      )}
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
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      await api("/account/reviews", {
        body: { orderId, productId, rating, comment },
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
    <Modal open onClose={onClose} title={`Review · ${productName}`} icon={Star}>
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
            placeholder="Ceritakan pengalamanmu pakai produk ini (maks 500 karakter)."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
          />
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
