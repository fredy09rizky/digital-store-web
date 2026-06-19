import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Star,
  CheckCircle2,
  XCircle,
  Trash2,
  Filter,
  MessageSquareText,
  Receipt,
} from "lucide-react";
import { api } from "../../lib/api";
import { dateID, relativeID } from "../../lib/format";
import { useToast } from "../../components/Toast";
import { Button } from "../../components/Button";
import { Empty } from "../../components/Empty";
import { ReviewCardSkeleton } from "../../components/Loading";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Pagination } from "../../components/Pagination";

interface RRow {
  id: string;
  product_id: string;
  product_name: string;
  username: string;
  rating: number;
  comment: string;
  status: string;
  created_at: number;
  order_id: string;
  order_code: string;
}

interface RPage {
  items: RRow[];
  page: number;
  pageSize: number;
  total: number;
}

const PAGE_SIZE = 20;

const TABS: { value: "pending" | "approved" | "rejected"; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export default function AdminReviews() {
  const [data, setData] = useState<RPage | null>(null);
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [page, setPage] = useState(1);
  const [confirmDel, setConfirmDel] = useState<RRow | null>(null);
  const toast = useToast();

  async function load() {
    const r = await api<RPage>(
      `/admin/reviews/?status=${status}&page=${page}&page_size=${PAGE_SIZE}`,
    );
    // Auto mundur kalau halaman jadi kosong setelah moderasi/hapus padahal
    // masih ada data di halaman sebelumnya.
    if (r.items.length === 0 && r.total > 0 && page > 1) {
      setPage((p) => Math.max(1, p - 1));
      return;
    }
    setData(r);
  }

  // Reset ke halaman 1 saat ganti tab status.
  useEffect(() => {
    setPage(1);
  }, [status]);

  useEffect(() => {
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page]);

  async function moderate(id: string, target: "approved" | "rejected") {
    try {
      await api(`/admin/reviews/${id}/moderate`, { body: { status: target } });
      toast.success(`Review di-${target}.`);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal moderasi.");
    }
  }
  async function del(r: RRow) {
    try {
      await api(`/admin/reviews/${r.id}`, { method: "DELETE" });
      toast.success("Review dihapus.");
      setConfirmDel(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal hapus review.");
      throw e;
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="size-9 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
          <Star size={18} />
        </div>
        <h1
          className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Review
        </h1>
      </div>

      <div className="flex items-center gap-1 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-1 w-fit overflow-x-auto scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatus(t.value)}
            className={
              "px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition whitespace-nowrap " +
              (status === t.value
                ? "bg-[var(--color-brand-500)] text-white"
                : "text-[var(--color-ink-2)] hover:text-[var(--color-brand-700)]")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {data === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <ReviewCardSkeleton key={i} />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <Empty
          icon={Filter}
          title={`Tidak ada review ${status}`}
          hint="Coba ganti tab di atas untuk melihat status lain."
        />
      ) : (
        <>
          <div className="space-y-2">
            {data.items.map((r) => (
              <ReviewCard
                key={r.id}
                row={r}
                onModerate={(t) => moderate(r.id, t)}
                onDelete={() => setConfirmDel(r)}
              />
            ))}
          </div>
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={setPage}
          />
        </>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title="Hapus review?"
        tone="danger"
        confirmLabel="Hapus review"
        description={
          confirmDel ? (
            <>
              Review dari <span className="font-semibold">@{confirmDel.username}</span> untuk
              produk <span className="font-semibold">{confirmDel.product_name}</span> akan
              dihapus permanen.
            </>
          ) : (
            "Review akan dihapus permanen."
          )
        }
        onClose={() => setConfirmDel(null)}
        onConfirm={() => (confirmDel ? del(confirmDel) : Promise.resolve())}
      />
    </div>
  );
}

function ReviewCard({
  row: r,
  onModerate,
  onDelete,
}: {
  row: RRow;
  onModerate: (t: "approved" | "rejected") => void;
  onDelete: () => void;
}) {
  return (
    <article className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-bold text-[var(--color-ink)] line-clamp-1">{r.product_name}</div>
          <div className="text-xs text-[var(--color-ink-3)] flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
            <span className="font-semibold text-[var(--color-ink-2)]">@{r.username}</span>
            <span aria-hidden>·</span>
            <span title={dateID(r.created_at)}>{relativeID(r.created_at)}</span>
            <span aria-hidden>·</span>
            <Link
              to={`/admin/order/${r.order_id}`}
              className="inline-flex items-center gap-1 font-semibold text-[var(--color-brand-700)] hover:underline"
              style={{ fontFamily: "var(--font-ui)" }}
              title="Buka detail order"
            >
              <Receipt size={12} className="shrink-0" />
              {r.order_code}
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              size={16}
              className={
                i < r.rating
                  ? "fill-amber-400 stroke-amber-400"
                  : "stroke-[var(--color-border-strong)] fill-transparent"
              }
            />
          ))}
          <span className="ml-1.5 text-sm font-bold text-[var(--color-ink)]">{r.rating}/5</span>
        </div>
      </div>
      {r.comment ? (
        <div className="mt-2 text-sm text-[var(--color-ink)] whitespace-pre-line bg-[var(--color-surface-soft)] border border-[var(--color-border)] rounded-md p-3 inline-flex items-start gap-2 w-full">
          <MessageSquareText size={14} className="mt-0.5 shrink-0 text-[var(--color-ink-3)]" />
          <div className="flex-1 min-w-0">{r.comment}</div>
        </div>
      ) : (
        <div className="mt-2 text-xs text-[var(--color-ink-3)] italic">(tanpa komentar)</div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {r.status !== "approved" && (
          <Button
            size="sm"
            icon={CheckCircle2}
            onClick={() => onModerate("approved")}
          >
            Approve
          </Button>
        )}
        {r.status !== "rejected" && (
          <Button
            size="sm"
            variant="outline"
            icon={XCircle}
            onClick={() => onModerate("rejected")}
          >
            Reject
          </Button>
        )}
        <Button size="sm" variant="danger" icon={Trash2} onClick={onDelete}>
          Hapus
        </Button>
      </div>
    </article>
  );
}
