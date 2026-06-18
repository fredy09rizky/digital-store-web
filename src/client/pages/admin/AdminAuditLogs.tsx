import { useEffect, useState } from "react";
import { ScrollText, Search } from "lucide-react";
import { api } from "../../lib/api";
import { dateID } from "../../lib/format";
import { Pagination } from "../../components/Pagination";
import { Empty } from "../../components/Empty";
import { TableRowSkeleton } from "../../components/Loading";

interface ARow {
  id: string;
  actor_kind: string;
  actor_id: string | null;
  action: string;
  target_kind: string | null;
  target_id: string | null;
  meta: string;
  ip: string | null;
  created_at: number;
}

interface PageResp<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

const ACTOR_TONE: Record<string, string> = {
  user: "bg-[var(--color-surface-tint)] text-[var(--color-brand-700)]",
  admin: "bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]",
  system: "bg-[var(--color-surface-mute)] text-[var(--color-ink-2)]",
};

export default function AdminAuditLogs() {
  const [data, setData] = useState<PageResp<ARow> | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  async function load() {
    const usp = new URLSearchParams();
    if (q) usp.set("action", q);
    usp.set("page", String(page));
    setData(await api<PageResp<ARow>>(`/admin/dashboard/audit?${usp.toString()}`));
  }

  useEffect(() => {
    setPage(1);
  }, [q]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, page]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
            <ScrollText size={18} />
          </div>
          <h1
            className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Audit log
          </h1>
        </div>
        <div className="relative w-full sm:w-72">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] pointer-events-none"
          />
          <input
            className="input !pl-9 !text-sm"
            placeholder="Filter action (mis. order.paid)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col" className="!text-left">Waktu</th>
              <th scope="col">Aktor</th>
              <th scope="col">Action</th>
              <th scope="col">Target</th>
              <th scope="col">Meta</th>
              <th scope="col">IP</th>
            </tr>
          </thead>
          <tbody>
            {data === null && <TableRowSkeleton cols={6} rows={6} />}
            {(data?.items ?? []).map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap text-xs text-[var(--color-ink-2)]">
                  {dateID(a.created_at)}
                </td>
                <td>
                  <span
                    className={
                      "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider rounded-md px-2 py-0.5 " +
                      (ACTOR_TONE[a.actor_kind] ?? "bg-[var(--color-surface-mute)] text-[var(--color-ink-2)]")
                    }
                  >
                    {a.actor_kind}
                  </span>
                  {a.actor_id && (
                    <div
                      className="text-[11px] text-[var(--color-ink-3)] mt-0.5 font-mono"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {a.actor_id.slice(0, 12)}…
                    </div>
                  )}
                </td>
                <td>
                  <code className="text-xs font-mono text-[var(--color-brand-700)]">
                    {a.action}
                  </code>
                </td>
                <td className="text-xs text-[var(--color-ink-2)]">
                  {a.target_kind ? (
                    <>
                      <div className="font-semibold text-[var(--color-ink)]">{a.target_kind}</div>
                      <div className="text-[11px] text-[var(--color-ink-3)] font-mono">
                        {a.target_id?.slice(0, 16)}…
                      </div>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="text-xs">
                  <code className="font-mono break-all max-w-xs inline-block text-[var(--color-ink-2)]">
                    {a.meta && a.meta !== "{}" ? a.meta : "—"}
                  </code>
                </td>
                <td className="text-xs text-[var(--color-ink-2)]">{a.ip ?? "—"}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <Empty
                    icon={ScrollText}
                    title="Belum ada log"
                    hint="Aksi yang dilakukan user, admin, atau sistem akan tercatat di sini."
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
    </div>
  );
}
