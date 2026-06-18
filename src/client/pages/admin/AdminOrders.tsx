import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Receipt,
  Download,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Eraser,
  Package,
} from "lucide-react";
import { api } from "../../lib/api";
import type { OrderStatus } from "@shared/types";
import { rupiah, dateID } from "../../lib/format";
import { useToast } from "../../components/Toast";
import { adminConfirmPassword } from "./admin-session";
import { AdminConfirm } from "./AdminConfirm";
import { Pagination } from "../../components/Pagination";
import { StatusPill } from "../../components/StatusPill";
import { Button } from "../../components/Button";
import { Empty } from "../../components/Empty";
import { TableRowSkeleton } from "../../components/Loading";

interface Row {
  id: string;
  code: string;
  status: string;
  total_cents: number;
  created_at: number;
  paid_at: number | null;
  payment_method: string;
  username: string;
}

interface PageResp<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

const FILTERS: { value: string; label: string; tone: string }[] = [
  { value: "", label: "Semua", tone: "" },
  { value: "pending_payment", label: "Pending", tone: "" },
  { value: "paid", label: "Paid", tone: "" },
  { value: "expired", label: "Expired", tone: "" },
  { value: "refunded", label: "Refunded", tone: "" },
];

type Action =
  | { kind: "mark_paid"; id: string; code: string }
  | { kind: "refund"; id: string; code: string; total: number }
  | { kind: "delete"; id: string; code: string }
  | { kind: "cleanup" };

export default function AdminOrders() {
  const [data, setData] = useState<PageResp<Row> | null>(null);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<Action | null>(null);
  const toast = useToast();

  async function load() {
    const usp = new URLSearchParams();
    if (status) usp.set("status", status);
    usp.set("page", String(page));
    setData(await api<PageResp<Row>>(`/admin/orders?${usp.toString()}`));
  }
  useEffect(() => {
    setPage(1);
  }, [status]);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page]);

  async function execute(values: Record<string, string>) {
    if (!action) return;
    try {
      const ack = await adminConfirmPassword(values.__password);
      if (action.kind === "mark_paid") {
        await api(`/admin/orders/${action.id}/mark-paid`, { body: { ack } });
        toast.success("Order ditandai paid.");
      } else if (action.kind === "refund") {
        await api(`/admin/orders/${action.id}/refund`, {
          body: { ack, reason: values.reason ?? "" },
        });
        toast.success("Refund disetujui. Saldo user terisi.");
      } else if (action.kind === "delete") {
        await api(`/admin/orders/${action.id}`, { method: "DELETE", body: { ack } });
        toast.success("Order dihapus.");
      } else if (action.kind === "cleanup") {
        const r = await api<{ removed: number }>(`/admin/orders/cleanup-old`, { body: { ack } });
        toast.success(`${r.removed} order lama dibersihkan.`);
      }
      setAction(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal.");
      throw e;
    }
  }

  async function downloadCsv() {
    const r = await fetch(`/api/admin/dashboard/reports/transactions.csv`, {
      credentials: "include",
    });
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const dialogProps = (() => {
    if (!action) return null;
    if (action.kind === "mark_paid") {
      return {
        title: `Tandai paid: ${action.code}`,
        description:
          "Order akan ditandai sebagai lunas, stok dikomit ke pembeli, dan akun langsung dikirim.",
        fields: [],
        confirmLabel: "Tandai paid",
      };
    }
    if (action.kind === "refund") {
      return {
        title: `Refund order ${action.code}`,
        description: `Saldo user akan dikredit sebesar ${rupiah(action.total)} dan status order menjadi refunded.`,
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
    if (action.kind === "delete") {
      return {
        title: `Hapus order ${action.code}`,
        description:
          "Order beserta item & payment akan dihapus permanen. Tindakan tidak dapat dibatalkan.",
        fields: [],
        confirmLabel: "Hapus permanen",
        destructive: true,
      };
    }
    return {
      title: "Bersihkan order lama",
      description:
        "Hapus permanen semua order final (paid/expired/refunded/cancelled) yang dibuat lebih dari 30 hari yang lalu.",
      fields: [],
      confirmLabel: "Bersihkan",
      destructive: true,
    };
  })();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
            <Receipt size={18} />
          </div>
          <h1
            className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Order
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="outline" icon={Download} onClick={downloadCsv} size="sm">
            Export CSV
          </Button>
          <Button
            variant="danger"
            icon={Eraser}
            size="sm"
            onClick={() => setAction({ kind: "cleanup" })}
          >
            Bersihkan {">"}30 hari
          </Button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
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

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col" className="!text-left">Code</th>
              <th scope="col">User</th>
              <th scope="col">Status</th>
              <th scope="col">Total</th>
              <th scope="col">Method</th>
              <th scope="col">Dibuat</th>
              <th scope="col">Dibayar</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {data === null && <TableRowSkeleton cols={8} rows={6} />}
            {(data?.items ?? []).map((o) => {
              return (
                <tr key={o.id}>
                  <td>
                    <Link
                      to={`/admin/order/${o.id}`}
                      className="text-sm font-bold text-[var(--color-brand-700)] hover:underline"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {o.code}
                    </Link>
                  </td>
                  <td className="text-sm">@{o.username}</td>
                  <td>
                    <StatusPill status={o.status as OrderStatus} />
                  </td>
                  <td
                    className="font-bold text-[var(--color-ink)] tabular-nums"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    {rupiah(o.total_cents)}
                  </td>
                  <td className="text-xs text-[var(--color-ink-2)] capitalize">
                    {o.payment_method.replace("_", " ")}
                  </td>
                  <td className="text-xs text-[var(--color-ink-2)] whitespace-nowrap">
                    {dateID(o.created_at, { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="text-xs text-[var(--color-ink-2)] whitespace-nowrap">
                    {o.paid_at
                      ? dateID(o.paid_at, { dateStyle: "short", timeStyle: "short" })
                      : "—"}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      {o.status === "pending_payment" && (
                        <Button
                          size="sm"
                          icon={CheckCircle2}
                          onClick={() =>
                            setAction({ kind: "mark_paid", id: o.id, code: o.code })
                          }
                        >
                          Paid
                        </Button>
                      )}
                      {o.status === "paid" && (
                        <Button
                          size="sm"
                          variant="outline"
                          icon={RotateCcw}
                          onClick={() =>
                            setAction({
                              kind: "refund",
                              id: o.id,
                              code: o.code,
                              total: o.total_cents,
                            })
                          }
                        >
                          Refund
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="danger"
                        icon={Trash2}
                        onClick={() => setAction({ kind: "delete", id: o.id, code: o.code })}
                      >
                        Hapus
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <Empty
                    icon={Package}
                    title="Tidak ada order"
                    hint="Belum ada order dengan filter ini."
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
