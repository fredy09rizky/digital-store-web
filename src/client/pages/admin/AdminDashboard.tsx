import { useEffect, useState } from "react";
import {
  TrendingUp,
  CheckCircle2,
  Clock,
  XCircle,
  Users,
  Boxes,
  Star,
  Wallet,
  RotateCcw,
  Ticket,
  MessageCircle,
  Flame,
  LayoutDashboard,
} from "lucide-react";
import { api } from "../../lib/api";
import { rupiah } from "../../lib/format";
import { StatSkeleton } from "../../components/Loading";

interface Stats {
  omzetTodayCents: number;
  ordersPaidToday: number;
  ordersPending: number;
  ordersExpiredToday: number;
  activeUsers: number;
  activeStock: number;
  pendingReviews: number;
  walletInTodayCents: number;
  refundsToday: number;
  activeVouchers: number;
  chatsNeedAttention: number;
  bestSellersToday: { id: string; name: string; sold: number; thumbnail_url: string | null }[];
}

type Tone = "brand" | "emerald" | "amber" | "rose" | "sky" | "accent";

const TONE: Record<Tone, { wrap: string; iconBg: string; iconText: string; valueText: string }> = {
  brand: {
    wrap: "bg-[var(--color-surface)] border-[var(--color-border)]",
    iconBg: "bg-[var(--color-surface-tint)]",
    iconText: "text-[var(--color-brand-700)]",
    valueText: "text-[var(--color-ink)]",
  },
  emerald: {
    wrap: "bg-[var(--color-surface)] border-[var(--color-border)]",
    iconBg: "bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)]",
    iconText: "text-[var(--color-success)]",
    valueText: "text-[var(--color-ink)]",
  },
  amber: {
    wrap: "bg-[var(--color-surface)] border-[var(--color-border)]",
    iconBg: "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)]",
    iconText: "text-[var(--color-warning)]",
    valueText: "text-[var(--color-ink)]",
  },
  rose: {
    wrap: "bg-[var(--color-surface)] border-[var(--color-border)]",
    iconBg: "bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)]",
    iconText: "text-[var(--color-danger)]",
    valueText: "text-[var(--color-ink)]",
  },
  sky: {
    wrap: "bg-[var(--color-surface)] border-[var(--color-border)]",
    iconBg: "bg-[var(--color-surface-tint)]",
    iconText: "text-[var(--color-brand-700)]",
    valueText: "text-[var(--color-ink)]",
  },
  accent: {
    wrap: "bg-[var(--color-surface)] border-[var(--color-border)]",
    iconBg: "bg-[var(--color-accent-50)]",
    iconText: "text-[var(--color-accent-500)]",
    valueText: "text-[var(--color-ink)]",
  },
};

export default function AdminDashboard() {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    api<Stats>("/admin/dashboard/stats").then(setS).catch(() => null);
  }, []);

  if (!s) {
    // Skeleton dashboard: header + hero omzet + grid stat cards + best
    // sellers. Layout meniru struktur asli supaya tidak ada layout shift
    // saat data tiba.
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
            <LayoutDashboard size={20} />
          </div>
          <div>
            <h1
              className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Dashboard
            </h1>
            <p className="text-sm text-[var(--color-ink-2)]">
              Statistik harian dan ringkasan operasional.
            </p>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div
            className="p-6 sm:p-7"
            style={{ background: "linear-gradient(135deg, #1b1547 0%, #2a1d6b 50%, #3a1f63 100%)" }}
          >
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-xl bg-white/15 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 bg-white/20 rounded animate-pulse" />
                <div className="h-8 w-44 bg-white/25 rounded animate-pulse" />
                <div className="h-3 w-32 bg-white/15 rounded animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>

        <section className="card p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="size-8 rounded-lg bg-[var(--color-surface-soft)] animate-pulse" />
            <div className="h-4 w-40 bg-[var(--color-surface-soft)] rounded animate-pulse" />
          </div>
          <ul className="divide-y divide-[var(--color-border)]">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="py-2.5 flex items-center gap-3">
                <div className="size-7 rounded-md bg-[var(--color-surface-soft)] animate-pulse" />
                <div className="size-10 rounded-lg bg-[var(--color-surface-soft)] animate-pulse" />
                <div className="flex-1 h-4 bg-[var(--color-surface-soft)] rounded animate-pulse" />
                <div className="h-4 w-20 bg-[var(--color-surface-soft)] rounded animate-pulse" />
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
          <LayoutDashboard size={20} />
        </div>
        <div>
          <h1
            className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Dashboard
          </h1>
          <p className="text-sm text-[var(--color-ink-2)]">
            Statistik harian dan ringkasan operasional.
          </p>
        </div>
      </div>

      {/* Hero stat: omzet today */}
      <div className="card overflow-hidden relative">
        <div
          className="relative text-white p-6 sm:p-7 overflow-hidden"
          style={{ background: "linear-gradient(135deg, #1b1547 0%, #2a1d6b 50%, #3a1f63 100%)" }}
        >
          <div
            className="aurora-blob absolute -top-16 -right-10 size-72 rounded-full"
            style={{ background: "radial-gradient(circle, var(--color-aurora-3), transparent 70%)" }}
          />
          <div
            className="aurora-blob absolute -bottom-20 left-1/3 size-72 rounded-full"
            style={{ background: "radial-gradient(circle, var(--color-aurora-1), transparent 70%)" }}
          />
          <div className="relative flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-xl bg-white/15 backdrop-blur-sm grid place-items-center">
                <TrendingUp size={22} />
              </div>
              <div>
                <div className="eyebrow text-[10px] text-white/70">Omzet hari ini</div>
                <div
                  className="text-3xl sm:text-4xl font-bold tabular-nums"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {rupiah(s.omzetTodayCents)}
                </div>
                <div className="text-xs text-white/75 mt-0.5">
                  {s.ordersPaidToday} order sukses hari ini
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <HeroChip icon={Clock} label="Pending" value={s.ordersPending} />
              <HeroChip icon={MessageCircle} label="Chat" value={s.chatsNeedAttention} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <Stat icon={CheckCircle2} tone="emerald" label="Order sukses" value={s.ordersPaidToday} suffix="hari ini" />
        <Stat icon={Clock} tone="amber" label="Order pending" value={s.ordersPending} />
        <Stat icon={XCircle} tone="rose" label="Order expired" value={s.ordersExpiredToday} suffix="hari ini" />
        <Stat icon={Users} tone="brand" label="User aktif" value={s.activeUsers} />
        <Stat icon={Boxes} tone="brand" label="Stok aktif" value={s.activeStock} />
        <Stat icon={Star} tone="amber" label="Review menunggu" value={s.pendingReviews} />
        <Stat icon={Wallet} tone="emerald" label="Saldo masuk" value={rupiah(s.walletInTodayCents)} suffix="hari ini" />
        <Stat icon={RotateCcw} tone="sky" label="Refund hari ini" value={s.refundsToday} />
        <Stat icon={Ticket} tone="accent" label="Voucher aktif" value={s.activeVouchers} />
        <Stat icon={MessageCircle} tone="amber" label="Chat butuh respon" value={s.chatsNeedAttention} />
      </div>

      {/* Best sellers */}
      <section className="card p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="size-8 rounded-lg bg-[var(--color-accent-50)] text-[var(--color-accent-500)] grid place-items-center">
            <Flame size={16} />
          </div>
          <h2 className="font-bold text-[var(--color-ink)]">Best seller hari ini</h2>
        </div>
        {s.bestSellersToday.length === 0 ? (
          <div className="text-sm text-[var(--color-ink-2)] py-2">
            Belum ada penjualan hari ini.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {s.bestSellersToday.map((b, i) => (
              <li key={b.id} className="py-2.5 flex items-center gap-3">
                <div className="size-7 rounded-md bg-[var(--color-surface-soft)] grid place-items-center text-xs font-extrabold text-[var(--color-ink-2)]">
                  {i + 1}
                </div>
                <div className="size-10 rounded-lg overflow-hidden bg-[var(--color-surface-tint)] border border-[var(--color-border)] shrink-0">
                  {b.thumbnail_url ? (
                    <img src={b.thumbnail_url} className="size-full object-cover" alt="" />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0 font-semibold text-sm text-[var(--color-ink)] truncate">
                  {b.name}
                </div>
                <div
                  className="text-[var(--color-success)] font-extrabold text-sm tabular-nums"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {b.sold} terjual
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HeroChip({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-white/10 border border-white/15 backdrop-blur-sm px-3.5 py-2 text-center min-w-[78px]">
      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/70">
        <Icon size={12} /> {label}
      </div>
      <div className="text-lg font-bold tabular-nums text-white" style={{ fontFamily: "var(--font-ui)" }}>
        {value.toLocaleString("id-ID")}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  suffix,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: Tone;
  label: string;
  value: number | string;
  suffix?: string;
}) {
  const t = TONE[tone];
  return (
    <div className={`rounded-xl border ${t.wrap} p-4 transition hover:shadow-[var(--shadow-card)]`}>
      <div className="flex items-center gap-2.5">
        <div className={`size-9 rounded-lg ${t.iconBg} ${t.iconText} grid place-items-center`}>
          <Icon size={16} />
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)] line-clamp-2 leading-tight">
          {label}
        </div>
      </div>
      <div
        className={`mt-2 text-xl sm:text-2xl font-extrabold tabular-nums ${t.valueText}`}
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {typeof value === "number" ? value.toLocaleString("id-ID") : value}
      </div>
      {suffix && (
        <div className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wider mt-0.5">
          {suffix}
        </div>
      )}
    </div>
  );
}
