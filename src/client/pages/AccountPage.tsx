import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wallet,
  Receipt,
  ShoppingBag,
  LogOut,
  KeyRound,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  History,
  Sparkles,
  X,
  Lock,
} from "lucide-react";
import { api } from "../lib/api";
import { rupiah, dateID, relativeID } from "../lib/format";
import { useApp } from "../state/AppProviders";
import { useToast } from "../components/Toast";
import { Loading } from "../components/Loading";
import { Empty } from "../components/Empty";
import { Button, LinkButton } from "../components/Button";
import { Alert } from "../components/Alert";
import { useBackdropClose, useModalEffects } from "../lib/hooks";
import { validatePassword } from "@shared/constants";

interface MeResp {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  balanceCents: number;
  createdAt: number;
}
interface WtRow {
  id: string;
  kind: string;
  direction: string;
  amount_cents: number;
  balance_after_cents: number;
  related_order_id: string | null;
  note: string | null;
  created_at: number;
}

const QUICK_AMOUNTS = [10000, 25000, 50000, 75000, 100000, 200000];

export default function AccountPage() {
  const [me, setMe] = useState<MeResp | null>(null);
  const [tx, setTx] = useState<WtRow[]>([]);
  const [topup, setTopup] = useState(50000);
  const [busy, setBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const { refreshBoot } = useApp();
  const toast = useToast();
  const nav = useNavigate();

  async function load() {
    setMe(await api<MeResp>("/account/me"));
    setTx(await api<WtRow[]>("/account/wallet/transactions"));
  }

  useEffect(() => {
    load();
  }, []);

  async function startTopup() {
    if (topup < 10000) return toast.error("Minimal Rp10.000.");
    setBusy(true);
    try {
      const r = await api<{ orderId: string; code: string }>("/account/wallet/topup", {
        body: { amountCents: topup },
      });
      nav(`/pembayaran/${r.code}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal memulai top up.");
    } finally {
      setBusy(false);
    }
  }

  async function doLogout() {
    await api("/auth/logout", { method: "POST", body: {} }).catch(() => null);
    await refreshBoot();
    nav("/");
  }

  if (!me) return <Loading label="Memuat profil…" />;

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      <div className="space-y-4 min-w-0">
        {/* Profile card with balance highlight */}
        <div className="card overflow-hidden">
          <div
            className="relative text-white p-5 sm:p-6 overflow-hidden"
            style={{ background: "linear-gradient(135deg, #1b1547 0%, #2a1d6b 50%, #3a1f63 100%)" }}
          >
            <div
              className="aurora-blob absolute -top-16 -right-10 size-64 rounded-full"
              style={{ background: "radial-gradient(circle, var(--color-aurora-3), transparent 70%)" }}
            />
            <div className="relative flex items-center gap-4">
              <div
                className="size-14 rounded-2xl grid place-items-center text-white text-2xl font-bold"
                style={{ background: "linear-gradient(135deg, var(--color-aurora-1), var(--color-aurora-3))" }}
              >
                {me.username.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="font-extrabold text-lg sm:text-xl truncate"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  @{me.username}
                </div>
                <div className="text-sm text-white truncate">{me.email}</div>
                {me.displayName && (
                  <div className="text-xs text-white truncate mt-0.5">{me.displayName}</div>
                )}
              </div>
            </div>
            <div className="relative mt-5 rounded-xl bg-white/15 backdrop-blur-sm p-4 flex items-center gap-3">
              <Wallet size={22} className="text-white" />
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-wider text-white font-bold">
                  Saldo internal
                </div>
                <div
                  className="text-2xl sm:text-3xl font-extrabold tabular-nums"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {rupiah(me.balanceCents)}
                </div>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <LinkButton to="/akun/pesanan" variant="outline" icon={Receipt} className="!justify-start">
              Pesanan
            </LinkButton>
            <LinkButton to="/katalog" variant="outline" icon={ShoppingBag} className="!justify-start">
              Belanja
            </LinkButton>
            <Button
              variant="outline"
              icon={KeyRound}
              className="!justify-start"
              onClick={() => setPwOpen(true)}
            >
              Password
            </Button>
            <Button
              variant="outline"
              icon={LogOut}
              className="!justify-start !text-[var(--color-danger)] hover:!bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)]"
              onClick={doLogout}
            >
              Keluar
            </Button>
          </div>
        </div>

        {/* Mutasi saldo */}
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[var(--color-ink)] inline-flex items-center gap-2">
              <History size={16} className="text-[var(--color-brand-700)]" />
              Mutasi saldo
            </div>
            {tx.length > 0 && (
              <div className="text-xs text-[var(--color-ink-3)]">{tx.length} terakhir</div>
            )}
          </div>
          {tx.length === 0 ? (
            <Empty
              icon={History}
              title="Belum ada mutasi saldo"
              hint="Top up saldo dari panel kanan untuk mulai pakai pembayaran cepat."
            />
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {tx.map((t) => (
                <TxRow key={t.id} tx={t} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Topup aside */}
      <aside className="card p-5 space-y-3 h-fit lg:sticky lg:top-20">
        <div className="font-bold text-[var(--color-ink)] inline-flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--color-accent-500)]" />
          Top up saldo
        </div>
        <p className="text-xs text-[var(--color-ink-2)]">
          Pakai QRIS via Pakasir, saldo otomatis masuk ke akunmu setelah pembayaran sukses.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_AMOUNTS.map((v) => (
            <button
              key={v}
              onClick={() => setTopup(v)}
              type="button"
              className={
                "rounded-lg border-2 px-2 py-2 text-xs font-bold transition " +
                (topup === v
                  ? "bg-[var(--color-surface-tint)] border-[var(--color-brand-500)] text-[var(--color-brand-700)]"
                  : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-ink)] hover:border-[var(--color-brand-300)]")
              }
            >
              {rupiah(v)}
            </button>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="topup-amount">Atau nominal kustom</label>
          <input
            id="topup-amount"
            className="input"
            type="number"
            min={10000}
            step={1000}
            value={topup}
            onChange={(e) => setTopup(parseInt(e.target.value || "0", 10))}
            placeholder="Min Rp10.000"
          />
        </div>
        <Button onClick={startTopup} icon={Plus} block size="lg" loading={busy} disabled={busy || topup < 10000}>
          {busy ? "Memproses…" : `Top up ${rupiah(topup)}`}
        </Button>
        <div className="text-[11px] text-[var(--color-ink-3)] leading-relaxed">
          Refund yang disetujui admin masuk otomatis ke saldo. Saldo hanya berlaku di platform ini.
        </div>
      </aside>

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  topup: "Top up saldo",
  order_payment: "Pembayaran order",
  refund: "Refund",
  adjustment: "Penyesuaian admin",
  reversal: "Pembalikan transaksi",
};

function TxRow({ tx }: { tx: WtRow }) {
  const credit = tx.direction === "credit";
  const Icon = credit ? ArrowDownLeft : ArrowUpRight;
  return (
    <li className="py-3 flex items-center gap-3">
      <div
        className={
          "size-9 rounded-lg grid place-items-center shrink-0 " +
          (credit ? "bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)]" : "bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]")
        }
      >
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm text-[var(--color-ink)] truncate">
          {KIND_LABEL[tx.kind] ?? tx.kind}
        </div>
        <div className="text-[11px] text-[var(--color-ink-3)] flex items-center gap-1.5 mt-0.5">
          <span title={dateID(tx.created_at)}>{relativeID(tx.created_at)}</span>
          {tx.related_order_id && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">order linked</span>
            </>
          )}
        </div>
        {tx.note && (
          <div className="text-[11px] text-[var(--color-ink-2)] truncate mt-0.5">{tx.note}</div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div
          className={
            "font-extrabold tabular-nums text-sm " +
            (credit ? "text-[var(--color-success)]" : "text-[var(--color-danger)]")
          }
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {credit ? "+" : "−"} {rupiah(tx.amount_cents)}
        </div>
        <div className="text-[10px] text-[var(--color-ink-3)] mt-0.5">
          Sisa: {rupiah(tx.balance_after_cents)}
        </div>
      </div>
    </li>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldP, setOldP] = useState("");
  const [newP, setNewP] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const nav = useNavigate();

  useModalEffects(true, () => {
    if (!busy) onClose();
  });
  const onBackdropClick = useBackdropClose(() => {
    if (!busy) onClose();
  });

  async function submit() {
    setErr(null);
    const pErr = validatePassword(newP);
    if (pErr) {
      setErr(pErr);
      return;
    }
    setBusy(true);
    try {
      await api("/auth/change-password", { body: { currentPassword: oldP, newPassword: newP } });
      toast.success("Password diganti. Silakan login ulang.");
      onClose();
      nav("/login");
    } catch (e: any) {
      setErr(e?.message ?? "Gagal ganti password. Pastikan password lama benar.");
    } finally {
      setBusy(false);
    }
  }

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
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
              <KeyRound size={18} />
            </div>
            <div className="font-extrabold text-lg text-[var(--color-ink)]">Ganti password</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="size-8 rounded-md grid place-items-center text-[var(--color-ink-3)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)]"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-[var(--color-ink-2)] mt-2">
          Setelah ganti password, semua sesi lama akan otomatis logout dan kamu perlu login ulang.
        </p>
        {err && (
          <div className="mt-3">
            <Alert tone="error" onClose={() => setErr(null)}>
              {err}
            </Alert>
          </div>
        )}
        <div className="space-y-3 mt-4">
          <div>
            <label className="label" htmlFor="cp-old">Password lama</label>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] pointer-events-none"
              />
              <input
                id="cp-old"
                className="input !pl-9"
                placeholder="Password saat ini"
                type="password"
                value={oldP}
                onChange={(e) => setOldP(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="cp-new">Password baru</label>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] pointer-events-none"
              />
              <input
                id="cp-new"
                className="input !pl-9"
                placeholder="Min 10, huruf besar & kecil, angka, simbol"
                type="password"
                value={newP}
                onChange={(e) => setNewP(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} loading={busy}>
            Simpan
          </Button>
        </div>
      </div>
    </div>
  );
}
