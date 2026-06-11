import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Receipt,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Ban,
  CreditCard,
  ChevronRight,
} from "lucide-react";
import { api } from "../lib/api";
import type { OrderListItem, OrderStatus } from "@shared/types";
import { rupiah, relativeID } from "../lib/format";
import { Empty } from "../components/Empty";
import { OrderRowSkeleton } from "../components/Loading";
import { LinkButton } from "../components/Button";

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Semua" },
  { value: "pending_payment", label: "Menunggu" },
  { value: "paid", label: "Lunas" },
  { value: "expired", label: "Kedaluwarsa" },
  { value: "refunded", label: "Refunded" },
];

const STATUS_INFO: Record<
  OrderStatus,
  {
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    cls: string;
  }
> = {
  pending_payment: {
    label: "Menunggu",
    icon: Clock,
    cls: "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_32%,transparent)]",
  },
  paid: { label: "Lunas", icon: CheckCircle2, cls: "bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)] border-[color-mix(in_srgb,var(--color-success)_32%,transparent)]" },
  expired: { label: "Kedaluwarsa", icon: XCircle, cls: "bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)] border-[color-mix(in_srgb,var(--color-danger)_32%,transparent)]" },
  cancelled: { label: "Dibatalkan", icon: Ban, cls: "bg-[var(--color-surface-mute)] text-[var(--color-ink-2)] border-[var(--color-border)]" },
  refunded: { label: "Direfund", icon: RefreshCw, cls: "bg-[var(--color-surface-tint)] text-[var(--color-brand-700)] border-[var(--color-brand-200)]" },
};

export default function OrdersPage() {
  const [list, setList] = useState<OrderListItem[] | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setList(null);
    const url = status ? `/orders?status=${status}` : "/orders";
    api<OrderListItem[]>(url).then(setList).catch(() => setList([]));
  }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
            <Receipt size={18} />
          </div>
          <h1
            className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Pesanan saya
          </h1>
        </div>
        <select
          className="select-input !w-auto !py-2 !text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter status pesanan"
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {/* Filter pills (mobile-friendly secondary) */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 sm:hidden">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={"pill " + (status === f.value ? "pill-active" : "")}
          >
            {f.label}
          </button>
        ))}
      </div>

      {list === null ? (
        <ul className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <OrderRowSkeleton key={i} />
          ))}
        </ul>
      ) : list.length === 0 ? (
        <Empty
          icon={Package}
          title="Belum ada pesanan"
          hint="Yuk mulai belanja dari katalog kami."
          action={
            <LinkButton to="/katalog" icon={Package}>
              Telusuri katalog
            </LinkButton>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {list.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderRow({ order: o }: { order: OrderListItem }) {
  const info = STATUS_INFO[o.status];
  const Icon = info.icon;
  const isPending = o.status === "pending_payment";
  const linkTo = isPending ? `/pembayaran/${o.code}` : `/akun/pesanan/${o.code}`;

  return (
    <li>
      <Link
        to={linkTo}
        className="card p-4 flex items-center gap-3 hover:border-[var(--color-brand-300)] hover:shadow-[var(--shadow-elev)] transition group"
      >
        <div className="size-10 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)] shrink-0">
          <Receipt size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div
              className="font-bold text-sm text-[var(--color-ink)] select-all"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {o.code}
            </div>
            <span
              className={
                "text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 inline-flex items-center gap-1 " +
                info.cls
              }
            >
              <Icon size={10} />
              {info.label}
            </span>
          </div>
          <div className="text-xs text-[var(--color-ink-2)] mt-1 inline-flex items-center gap-2 flex-wrap">
            <span>{relativeID(o.createdAt)}</span>
            <span aria-hidden className="text-[var(--color-ink-3)]">·</span>
            <span className="inline-flex items-center gap-1">
              <Package size={11} /> {o.itemCount} item
            </span>
            <span aria-hidden className="text-[var(--color-ink-3)]">·</span>
            <span className="inline-flex items-center gap-1 capitalize">
              <CreditCard size={11} /> {o.paymentMethod.replace("_", " ")}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className="font-extrabold text-[var(--color-ink)] text-sm"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {rupiah(o.totalCents)}
          </div>
          <div className="text-[11px] text-[var(--color-brand-700)] font-semibold mt-0.5 inline-flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
            {isPending ? "Bayar" : "Detail"}
            <ChevronRight size={12} />
          </div>
        </div>
      </Link>
    </li>
  );
}
