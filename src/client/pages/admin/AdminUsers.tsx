import { useEffect, useState } from "react";
import {
  Users,
  Search,
  Wallet,
  KeyRound,
  Trash2,
  ShieldOff,
  ShieldCheck,
  Filter,
  AlertTriangle,
} from "lucide-react";
import { api } from "../../lib/api";
import { rupiah, dateID } from "../../lib/format";
import { useToast } from "../../components/Toast";
import { adminConfirmPassword } from "./admin-session";
import { AdminConfirm } from "./AdminConfirm";
import { Pagination } from "../../components/Pagination";
import { Button } from "../../components/Button";
import { Empty } from "../../components/Empty";
import { TableRowSkeleton } from "../../components/Loading";

interface URow {
  id: string;
  username: string;
  email: string;
  status: string;
  status_reason: string | null;
  balance_cents: number;
  created_at: number;
  has_orders: boolean;
}

interface PageResp<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

type Action =
  | { kind: "status"; user: URow; target: "active" | "disabled" | "deleted" }
  | { kind: "password"; user: URow }
  | { kind: "balance"; user: URow };

const MAX_BALANCE_ADJUST_CENTS = 1_000_000;

const STATUS_CLS: Record<string, string> = {
  active: "bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)] border-[color-mix(in_srgb,var(--color-success)_32%,transparent)]",
  disabled: "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_32%,transparent)]",
  deleted: "bg-[var(--color-surface-mute)] text-[var(--color-ink-2)] border-[var(--color-border)]",
};

export default function AdminUsers() {
  const [data, setData] = useState<PageResp<URow> | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<Action | null>(null);
  const toast = useToast();

  async function load() {
    const usp = new URLSearchParams();
    if (q) usp.set("q", q);
    if (status) usp.set("status", status);
    usp.set("page", String(page));
    setData(await api<PageResp<URow>>(`/admin/users/?${usp.toString()}`));
  }
  useEffect(() => {
    setPage(1);
  }, [q, status]);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, page]);

  async function execute(values: Record<string, string>) {
    if (!action) return;
    try {
      const ack = await adminConfirmPassword(values.__password);
      if (action.kind === "status") {
        await api(`/admin/users/${action.user.id}/status`, {
          body: { ack, status: action.target, reason: values.reason ?? "" },
        });
        toast.success("Status user diperbarui.");
      } else if (action.kind === "password") {
        if (values.newPassword.length < 8) {
          toast.error("Password baru minimal 8 karakter.");
          throw new Error("short_password");
        }
        await api(`/admin/users/${action.user.id}/password`, {
          body: { ack, newPassword: values.newPassword },
        });
        toast.success("Password user di-reset.");
      } else if (action.kind === "balance") {
        const amt = parseInt(values.amount || "0", 10);
        if (!Number.isFinite(amt) || amt === 0) {
          toast.error("Nominal tidak valid.");
          throw new Error("invalid_amount");
        }
        if (Math.abs(amt) > MAX_BALANCE_ADJUST_CENTS) {
          toast.error(`Maksimal ±${rupiah(MAX_BALANCE_ADJUST_CENTS)} per adjust.`);
          throw new Error("amount_too_large");
        }
        if (amt < 0 && Math.abs(amt) > action.user.balance_cents) {
          toast.error(
            `Saldo user hanya ${rupiah(action.user.balance_cents)}. Tidak bisa dikurangi ${rupiah(Math.abs(amt))}.`,
          );
          throw new Error("insufficient_balance");
        }
        await api(`/admin/users/${action.user.id}/balance/adjust`, {
          body: { ack, amountCents: amt, note: values.note ?? "" },
        });
        toast.success("Saldo disesuaikan.");
      }
      setAction(null);
      load();
    } catch (e: any) {
      const skipMessages = new Set([
        "short_password",
        "invalid_amount",
        "amount_too_large",
        "insufficient_balance",
      ]);
      if (e?.message && !skipMessages.has(e.message)) {
        toast.error(e?.message ?? "Gagal.");
      }
      throw e;
    }
  }

  const dialogProps = (() => {
    if (!action) return null;
    if (action.kind === "status") {
      const labelMap = { active: "Aktifkan", disabled: "Nonaktifkan", deleted: "Hapus" };
      const willHardDelete = action.target === "deleted" && !action.user.has_orders;
      let description: string;
      if (action.target === "deleted") {
        description = willHardDelete
          ? "User belum pernah transaksi. Akun akan dihapus permanen dari database (hard delete)."
          : "User sudah pernah transaksi. Akun akan di-anonimkan (status='deleted', PII dihapus, password dikosongkan). Riwayat order tetap utuh untuk audit. Saldo wajib 0 sebelum hapus.";
      } else if (action.target === "disabled") {
        description = "User tidak bisa login lagi. Sesi aktif akan invalid.";
      } else {
        description = "User akan kembali aktif dan bisa login.";
      }
      return {
        title: `${labelMap[action.target]}: @${action.user.username}`,
        description,
        fields:
          action.target === "active"
            ? []
            : [
                {
                  name: "reason",
                  label: "Alasan",
                  type: "textarea" as const,
                  required: false,
                  placeholder: "Catatan internal untuk audit.",
                },
              ],
        confirmLabel:
          action.target === "deleted"
            ? willHardDelete
              ? "Hapus permanen"
              : "Anonimkan & hapus"
            : labelMap[action.target],
        destructive: action.target !== "active",
      };
    }
    if (action.kind === "password") {
      return {
        title: `Reset password: @${action.user.username}`,
        description: "Sesi user akan invalid otomatis setelah password di-reset.",
        fields: [
          {
            name: "newPassword",
            label: "Password baru (min 8 karakter)",
            type: "password" as const,
            required: true,
          },
        ],
        confirmLabel: "Reset password",
        destructive: true,
      };
    }
    return {
      title: `Sesuaikan saldo: @${action.user.username}`,
      description: `Saldo saat ini ${rupiah(action.user.balance_cents)}. Positif untuk kredit, negatif untuk debit. Maksimal ±${rupiah(MAX_BALANCE_ADJUST_CENTS)} per adjust. Saldo tidak bisa minus.`,
      fields: [
        {
          name: "amount",
          label: "Nominal (Rp)",
          type: "number" as const,
          required: true,
          placeholder: `±${MAX_BALANCE_ADJUST_CENTS.toLocaleString("id-ID")}`,
        },
        {
          name: "note",
          label: "Catatan (opsional)",
          type: "text" as const,
          required: false,
        },
      ],
      confirmLabel: "Sesuaikan saldo",
    };
  })();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
            <Users size={18} />
          </div>
          <h1
            className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            User
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] pointer-events-none"
            />
            <input
              className="input !pl-9 !text-sm !w-[200px]"
              placeholder="Cari user / email"
              aria-label="Cari user atau email"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className="select-input !w-auto !py-2 !text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter status user"
          >
            <option value="">Semua aktif</option>
            <option value="active">Aktif</option>
            <option value="disabled">Dinonaktifkan</option>
            <option value="deleted">Dihapus</option>
          </select>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="!text-left">User</th>
              <th>Status</th>
              <th>Saldo</th>
              <th>Dibuat</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data === null && <TableRowSkeleton cols={5} rows={6} />}
            {(data?.items ?? []).map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="size-9 rounded-full bg-[var(--color-brand-500)] grid place-items-center text-white text-sm font-extrabold shrink-0">
                      {u.username.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-[var(--color-ink)] truncate">
                        @{u.username}
                      </div>
                      <div className="text-[11px] text-[var(--color-ink-3)] truncate">
                        {u.email}
                      </div>
                      {u.status_reason && (
                        <div className="text-[11px] text-[var(--color-danger)] inline-flex items-center gap-1 mt-0.5">
                          <AlertTriangle size={10} />
                          {u.status_reason}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  <span
                    className={
                      "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 " +
                      (STATUS_CLS[u.status] ?? "bg-[var(--color-surface-mute)] text-[var(--color-ink-2)] border-[var(--color-border)]")
                    }
                  >
                    {u.status}
                  </span>
                </td>
                <td
                  className="font-bold text-[var(--color-ink)] tabular-nums"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  {rupiah(u.balance_cents)}
                </td>
                <td className="text-xs text-[var(--color-ink-2)] whitespace-nowrap">
                  {dateID(u.created_at, { dateStyle: "short" })}
                </td>
                <td className="text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    {u.status !== "active" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={ShieldCheck}
                        onClick={() =>
                          setAction({ kind: "status", user: u, target: "active" })
                        }
                      >
                        Aktif
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={ShieldOff}
                        onClick={() =>
                          setAction({ kind: "status", user: u, target: "disabled" })
                        }
                      >
                        Disable
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      icon={KeyRound}
                      onClick={() => setAction({ kind: "password", user: u })}
                    >
                      Reset
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={Wallet}
                      onClick={() => setAction({ kind: "balance", user: u })}
                    >
                      Saldo
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      icon={Trash2}
                      onClick={() =>
                        setAction({ kind: "status", user: u, target: "deleted" })
                      }
                    >
                      Hapus
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <Empty
                    icon={Filter}
                    title="Tidak ada user"
                    hint="Coba ubah filter atau pencarian."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
        />
      )}

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
