import { useEffect, useState } from "react";
import {
  Star,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  Trash2,
  Filter,
  MessageSquareText,
} from "lucide-react";
import { api } from "../../lib/api";
import { dateID, relativeID } from "../../lib/format";
import { useToast } from "../../components/Toast";
import { Button } from "../../components/Button";
import { Empty } from "../../components/Empty";
import { ReviewCardSkeleton } from "../../components/Loading";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface RRow {
  id: string;
  product_id: string;
  product_name: string;
  username: string;
  rating: number;
  comment: string;
  status: string;
  created_at: number;
}

const TABS: { value: "pending" | "approved" | "rejected" | "spam"; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "spam", label: "Spam" },
];

export default function AdminReviews() {
  const [list, setList] = useState<RRow[] | null>(null);
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "spam">("pending");
  const [confirmDel, setConfirmDel] = useState<RRow | null>(null);
  const toast = useToast();

  async function load() {
    setList(null);
    setList(await api<RRow[]>(`/admin/reviews/?status=${status}`));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function moderate(id: string, target: "approved" | "rejected" | "spam") {
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

      {list === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <ReviewCardSkeleton key={i} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Empty
          icon={Filter}
          title={`Tidak ada review ${status}`}
          hint="Coba ganti tab di atas untuk melihat status lain."
        />
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <ReviewCard
              key={r.id}
              row={r}
              onModerate={(t) => moderate(r.id, t)}
              onDelete={() => setConfirmDel(r)}
            />
          ))}
        </div>
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
              dihapus permanen. Foto pendukung review juga ikut dihapus.
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
  onModerate: (t: "approved" | "rejected" | "spam") => void;
  onDelete: () => void;
}) {
  return (
    <article className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-bold text-[var(--color-ink)] line-clamp-1">{r.product_name}</div>
          <div className="text-xs text-[var(--color-ink-3)] inline-flex items-center gap-1.5 mt-0.5">
            <span className="font-semibold text-[var(--color-ink-2)]">@{r.username}</span>
            <span aria-hidden>·</span>
            <span title={dateID(r.created_at)}>{relativeID(r.created_at)}</span>
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
        {r.status !== "spam" && (
          <Button
            size="sm"
            variant="outline"
            icon={AlertOctagon}
            onClick={() => onModerate("spam")}
          >
            Spam
          </Button>
        )}
        <Button size="sm" variant="danger" icon={Trash2} onClick={onDelete}>
          Hapus
        </Button>
      </div>
    </article>
  );
}
