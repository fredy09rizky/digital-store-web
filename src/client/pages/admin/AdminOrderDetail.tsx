import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CreditCard,
  Receipt,
  Calendar,
  Package,
  CheckCircle2,
  RotateCcw,
  Trash2,
  KeyRound,
  Mail,
  Lock,
  StickyNote,
  ImageOff,
  Eye,
  EyeOff,
  Copy,
  Check,
  ExternalLink,
  User as UserIcon,
} from "lucide-react";
import { api } from "../../lib/api";
import type { OrderStatus } from "@shared/types";
import { rupiah, dateID } from "../../lib/format";
import { useToast } from "../../components/Toast";
import { Loading } from "../../components/Loading";
import { Button, IconButton } from "../../components/Button";
import { StatusPill } from "../../components/StatusPill";
import { Empty } from "../../components/Empty";
import { adminConfirmPassword } from "./admin-session";
import { AdminConfirm } from "./AdminConfirm";

interface OrderItem {
  id: string;
  productName: string;
  qty: number;
  unitPriceCents: number;
  subtotalCents: number;
}

interface PaymentInfo {
  provider: string;
  method: string;
  status: string;
  qrPayload: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  proofUrl: string | null;
  displayAmountCents: number;
  feeCents: number;
}

interface InvItem {
  id: string;
  productName: string | null;
  content: string;
  status: string;
}

interface Detail {
  id: string;
  code: string;
  status: OrderStatus;
  paymentMethod: string;
  username: string;
  email: string;
  subtotalCents: number;
  discountCents: number;
  serviceFeeCents: number;
  totalCents: number;
  voucherCode: string | null;
  createdAt: number;
  expiresAt: number;
  paidAt: number | null;
  refundedAt: number | null;
  notes: string | null;
  items: OrderItem[];
  payment: PaymentInfo | null;
  inventory: InvItem[];
}

type Action =
  | { kind: "mark_paid" }
  | { kind: "refund" }
  | { kind: "delete" };

function methodLabel(m: string): string {
  if (m === "qris") return "QRIS";
  if (m === "bank_transfer") return "Transfer Bank";
  if (m === "wallet") return "Saldo";
  return m;
}

export default function AdminOrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [o, setO] = useState<Detail | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setO(await api<Detail>(`/admin/orders/${id}`));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function execute(values: Record<string, string>) {
    if (!action || !o) return;
    try {
      const ack = await adminConfirmPassword(values.__password);
      if (action.kind === "mark_paid") {
        await api(`/admin/orders/${o.id}/mark-paid`, { body: { ack } });
        toast.success("Order ditandai paid.");
      } else if (action.kind === "refund") {
        await api(`/admin/orders/${o.id}/refund`, { body: { ack, reason: values.reason ?? "" } });
        toast.success("Refund disetujui. Saldo user terisi.");
      } else if (action.kind === "delete") {
        await api(`/admin/orders/${o.id}`, { method: "DELETE", body: { ack } });
        toast.success("Order dihapus.");
        nav("/admin/order");
        return;
      }
      setAction(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal.");
      throw e;
    }
  }

  if (!o) return <Loading label="Memuat detail order…" />;

  const dialogProps = (() => {
    if (!action) return null;
    if (action.kind === "mark_paid") {
      return {
        title: `Tandai paid: ${o.code}`,
        description:
          "Order akan ditandai lunas, stok dikomit ke pembeli, dan akun langsung dikirim.",
        fields: [],
        confirmLabel: "Tandai paid",
      };
    }
    if (action.kind === "refund") {
      return {
        title: `Refund order ${o.code}`,
        description: `Saldo user akan dikredit ${rupiah(o.totalCents)} dan status order menjadi refunded.`,
        fields: [
          {
            name: "reason",
            label: "Alasan refund (opsional)",
            type: "textarea" as const,
            required: false,
            placeholder: "Catatan internal untuk audit log.",
          },
        ],
        confirmLabel: "Setujui refund",
      };
    }
    return {
      title: `Hapus order ${o.code}`,
      description:
        "Order beserta item & payment akan dihapus permanen. Tindakan tidak dapat dibatalkan.",
      fields: [],
      confirmLabel: "Hapus permanen",
      destructive: true,
    };
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-ink-2)]">
        <Link
          to="/admin/order"
          className="inline-flex items-center gap-1 hover:text-[var(--color-brand-700)] font-semibold"
        >
          <ArrowLeft size={14} /> Daftar order
        </Link>
        <span>{dateID(o.createdAt)}</span>
      </div>

      {/* Header */}
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
            <div className="text-xs text-[var(--color-ink-2)] inline-flex items-center gap-1.5 mt-1">
              <UserIcon size={12} /> @{o.username} · {o.email}
            </div>
          </div>
          <StatusPill status={o.status} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <Stat icon={CreditCard} label="Metode" value={methodLabel(o.paymentMethod)} />
          <Stat icon={Receipt} label="Total" value={rupiah(o.totalCents)} highlight />
          <Stat
            icon={Calendar}
            label="Dibayar"
            value={o.paidAt ? dateID(o.paidAt, { dateStyle: "short", timeStyle: "short" }) : "—"}
          />
          <Stat
            icon={Calendar}
            label="Refund"
            value={o.refundedAt ? dateID(o.refundedAt, { dateStyle: "short", timeStyle: "short" }) : "—"}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mt-5">
          {o.status === "pending_payment" && (
            <Button icon={CheckCircle2} onClick={() => setAction({ kind: "mark_paid" })}>
              Tandai paid
            </Button>
          )}
          {o.status === "paid" && (
            <Button variant="outline" icon={RotateCcw} onClick={() => setAction({ kind: "refund" })}>
              Refund
            </Button>
          )}
          <Button variant="danger" icon={Trash2} onClick={() => setAction({ kind: "delete" })}>
            Hapus order
          </Button>
        </div>
      </div>

      {/* Items + ringkasan harga */}
      <div className="card p-5">
        <div className="font-bold text-sm text-[var(--color-ink)] mb-2 inline-flex items-center gap-2">
          <Package size={14} className="text-[var(--color-brand-700)]" /> Item
        </div>
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] overflow-hidden">
          {o.items.map((it) => (
            <li
              key={it.id}
              className="px-3 py-2.5 flex items-center justify-between text-sm bg-[var(--color-surface)] gap-3"
            >
              <span className="text-[var(--color-ink)] min-w-0">
                <span className="font-bold mr-1">{it.qty}×</span>
                {it.productName}
              </span>
              <span
                className="font-bold text-[var(--color-ink)] tabular-nums shrink-0"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {rupiah(it.subtotalCents)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 text-sm">
          <Row label="Subtotal" value={rupiah(o.subtotalCents)} />
          {o.discountCents > 0 && (
            <Row label={`Diskon${o.voucherCode ? ` (${o.voucherCode})` : ""}`} value={`- ${rupiah(o.discountCents)}`} />
          )}
          {o.serviceFeeCents > 0 && <Row label="Biaya layanan" value={rupiah(o.serviceFeeCents)} />}
          <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border)] mt-1">
            <span className="font-bold text-[var(--color-ink)]">Total</span>
            <span
              className="font-extrabold text-[var(--color-ink)] tabular-nums"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {rupiah(o.totalCents)}
            </span>
          </div>
        </dl>
        {o.notes && (
          <div className="text-xs text-[var(--color-ink-2)] mt-3 bg-[var(--color-surface-soft)] border border-[var(--color-border)] rounded-md p-2.5">
            <span className="font-bold">Catatan:</span> {o.notes}
          </div>
        )}
      </div>

      {/* Pembayaran + bukti transfer */}
      {o.payment && (
        <div className="card p-5">
          <div className="font-bold text-sm text-[var(--color-ink)] mb-3 inline-flex items-center gap-2">
            <CreditCard size={14} className="text-[var(--color-brand-700)]" /> Pembayaran
          </div>
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <Row label="Provider" value={o.payment.provider} />
            <Row label="Status bayar" value={o.payment.status} />
            <Row label="Tagihan" value={rupiah(o.payment.displayAmountCents)} />
            {o.payment.feeCents > 0 && <Row label="Fee gateway" value={rupiah(o.payment.feeCents)} />}
            {o.payment.bankName && <Row label="Bank" value={o.payment.bankName} />}
            {o.payment.bankAccount && <Row label="No. rekening" value={o.payment.bankAccount} />}
            {o.payment.bankHolder && <Row label="Atas nama" value={o.payment.bankHolder} />}
          </div>

          {o.paymentMethod === "bank_transfer" && (
            <div className="mt-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)] mb-1.5">
                Bukti transfer
              </div>
              {o.payment.proofUrl ? (
                <a href={o.payment.proofUrl} target="_blank" rel="noreferrer" className="inline-block group">
                  <img
                    src={o.payment.proofUrl}
                    alt="Bukti transfer"
                    className="max-h-72 rounded-lg border border-[var(--color-border)] group-hover:opacity-90 transition"
                  />
                  <span className="mt-1 text-[11px] text-[var(--color-brand-700)] inline-flex items-center gap-1">
                    <ExternalLink size={11} /> Buka ukuran penuh
                  </span>
                </a>
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-xs text-[var(--color-ink-3)] inline-flex items-center gap-2">
                  <ImageOff size={14} /> User belum mengunggah bukti transfer.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Akun terkirim / tereservasi */}
      <div className="card p-5">
        <div className="font-bold text-sm text-[var(--color-ink)] mb-3 inline-flex items-center gap-2">
          <KeyRound size={14} className="text-[var(--color-brand-700)]" /> Akun terkait order
        </div>
        {o.inventory.length === 0 ? (
          <Empty icon={KeyRound} title="Belum ada akun" hint="Akun akan muncul setelah order lunas." />
        ) : (
          <div className="space-y-2">
            {o.inventory.map((it) => (
              <AccountCard key={it.id} it={it} />
            ))}
          </div>
        )}
      </div>

      {dialogProps && (
        <AdminConfirm
          open
          requirePassword
          onClose={() => setAction(null)}
          onSubmit={execute}
          {...dialogProps}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--color-ink-2)]">{label}</span>
      <span className="text-[var(--color-ink)] font-semibold text-right break-all">{value}</span>
    </div>
  );
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
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)] inline-flex items-center gap-1">
        <Icon size={11} /> {label}
      </div>
      <div
        className={
          "font-extrabold mt-0.5 tabular-nums " +
          (highlight ? "text-[var(--color-brand-700)] text-base" : "text-[var(--color-ink)] text-sm")
        }
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {value}
      </div>
    </div>
  );
}

function AccountCard({ it }: { it: InvItem }) {
  const [show, setShow] = useState(false);
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-ink-2)]">
          {it.productName ?? "Produk"}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)]">
            {it.status}
          </span>
          <IconButton
            icon={show ? EyeOff : Eye}
            label={show ? "Sembunyikan" : "Tampilkan"}
            size={14}
            className="!size-7"
            onClick={() => setShow((v) => !v)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        {show ? (
          <pre className="text-xs whitespace-pre-wrap break-all font-mono text-[var(--color-ink)] max-h-72 overflow-auto bg-[var(--color-surface-soft)] border border-[var(--color-border)] rounded-md p-2">
            {it.content}
          </pre>
        ) : (
          <div className="text-xs font-mono text-[var(--color-ink-3)]">
            •••••••••• (klik ikon mata untuk menampilkan)
          </div>
        )}
      </div>
    </div>
  );
}

function CredRow({
  icon: Icon,
  value,
  masked,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  value: string;
  masked?: boolean;
}) {
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
    <div className="flex items-center gap-1.5 min-w-0">
      <Icon size={12} className="text-[var(--color-ink-3)] shrink-0" />
      <span className="font-mono text-xs text-[var(--color-ink)] truncate flex-1">
        {masked ? "••••••••••" : value}
      </span>
      <IconButton
        icon={copied ? Check : Copy}
        label="Salin"
        size={12}
        className={"!size-7 shrink-0 " + (copied ? "!text-[var(--color-success)]" : "")}
        onClick={copy}
      />
    </div>
  );
}
