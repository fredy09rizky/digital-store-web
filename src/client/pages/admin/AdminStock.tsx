import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Boxes,
  Upload,
  FileUp,
  Plus,
  Trash2,
  Mail,
  Lock,
  Calendar,
  StickyNote,
  Eye,
  EyeOff,
  Copy,
  Check,
} from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { dateID } from "../../lib/format";
import { Button, IconButton } from "../../components/Button";
import { Empty } from "../../components/Empty";
import { TableRowSkeleton } from "../../components/Loading";
import { Pagination } from "../../components/Pagination";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface ItemRow {
  id: string;
  payload_email: string;
  payload_password: string;
  payload_note: string | null;
  payload_expiry: string | null;
  payload_extra: string | null;
  status: string;
  reserved_for_order_id: string | null;
  sold_to_order_id: string | null;
  created_at: number;
}

interface StockStats {
  total: number;
  available: number;
  reserved: number;
  sold: number;
}

interface StockResponse {
  items: ItemRow[];
  page: number;
  pageSize: number;
  total: number;
  stats: StockStats;
}

const STATUS_CLS: Record<string, string> = {
  available: "bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)] border-[color-mix(in_srgb,var(--color-success)_32%,transparent)]",
  reserved: "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_32%,transparent)]",
  sold: "bg-[var(--color-surface-tint)] text-[var(--color-brand-700)] border-sky-200",
};

export default function AdminStock() {
  const { productId } = useParams();
  const [data, setData] = useState<StockResponse | null>(null);
  const [page, setPage] = useState(1);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAllPwd, setShowAllPwd] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const toast = useToast();

  const PAGE_SIZE = 50;
  const list = data?.items ?? null;
  const stats = data?.stats ?? null;

  async function load() {
    const r = await api<StockResponse>(
      `/admin/products/${productId}/stock?page=${page}&page_size=${PAGE_SIZE}`,
    );
    // Auto mundur kalau halaman jadi kosong setelah hapus stok padahal masih
    // ada data di halaman sebelumnya.
    if (r.items.length === 0 && r.total > 0 && page > 1) {
      setPage((p) => Math.max(1, p - 1));
      return;
    }
    setData(r);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, page]);

  async function upload(textVal: string) {
    if (!textVal.trim()) return toast.error("Tidak ada data.");
    setBusy(true);
    try {
      const r = await api<{ added: number }>("/admin/products/stock/upload", {
        body: { productId, text: textVal },
      });
      toast.success(`${r.added} item ditambahkan.`);
      setText("");
      if (page !== 1) setPage(1);
      else load();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal upload.");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    upload(text);
    e.target.value = "";
  }

  async function deleteStock(ids: string[]) {
    if (!ids.length) return;
    try {
      const r = await api<{ removed: number }>("/admin/products/stock/delete", { body: { ids } });
      toast.success(`${r.removed} item stok dihapus.`);
      setSel(new Set());
      setConfirmDeleteOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal menghapus stok.");
      throw e;
    }
  }

  // Statistik diambil dari server (akurat lepas dari pagination).

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/admin/produk"
          className="text-sm text-[var(--color-ink-2)] hover:text-[var(--color-brand-700)] inline-flex items-center gap-1 font-semibold"
        >
          <ArrowLeft size={14} /> Kembali ke produk
        </Link>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="size-9 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
          <Boxes size={18} />
        </div>
        <h1
          className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Stok produk
        </h1>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatChip label="Total" value={stats.total} />
          <StatChip label="Available" value={stats.available} tone="emerald" />
          <StatChip label="Reserved" value={stats.reserved} tone="amber" />
          <StatChip label="Sold" value={stats.sold} tone="sky" />
        </div>
      )}

      {/* Upload */}
      <section className="card p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <Upload size={16} className="text-[var(--color-brand-700)]" />
          <div className="font-bold text-[var(--color-ink)]">Tambah stok</div>
        </div>
        <div className="rounded-lg bg-[var(--color-surface-tint)] border border-[var(--color-brand-200)] p-3 text-xs text-[var(--color-ink)] leading-relaxed">
          Format minimal:{" "}
          <code className="font-mono bg-[var(--color-surface)] px-1 rounded">email|password</code>. Boleh tambah
          note, expiry, dan field lain dengan pemisah <code className="font-mono">|</code>. Baris
          kosong dan diawali <code className="font-mono">#</code> diabaikan.
        </div>
        <textarea
          className="textarea !min-h-[180px] !font-mono !text-xs"
          placeholder={`# komentar
user1@mail.com|password123|2FA off|2026-12-31
user2@mail.com|S3cret|extra info`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => upload(text)} loading={busy} icon={Plus}>
            Tambah dari teks
          </Button>
          <label className="btn-outline cursor-pointer">
            <FileUp size={16} />
            <span>Import .txt</span>
            <input
              type="file"
              accept=".txt,text/plain"
              onChange={importFile}
              className="hidden"
            />
          </label>
        </div>
      </section>

      {/* Stok list */}
      <section className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-2 bg-[var(--color-surface)]">
          <div className="font-bold text-sm text-[var(--color-ink)]">Daftar stok</div>
          <Button
            variant="ghost"
            size="sm"
            icon={showAllPwd ? EyeOff : Eye}
            onClick={() => setShowAllPwd((v) => !v)}
          >
            {showAllPwd ? "Sembunyikan" : "Tampilkan"} password
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="!w-10 !p-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-brand-500)]"
                    checked={
                      !!list &&
                      sel.size > 0 &&
                      list.filter((x) => x.status === "available").every((x) => sel.has(x.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked && list) {
                        setSel(new Set(list.filter((x) => x.status === "available").map((x) => x.id)));
                      } else {
                        setSel(new Set());
                      }
                    }}
                    aria-label="Pilih semua available"
                  />
                </th>
                <th className="!text-left">Email / Akun</th>
                <th>Password</th>
                <th>Catatan</th>
                <th>Expired</th>
                <th>Status</th>
                <th>Order</th>
                <th>Dibuat</th>
              </tr>
            </thead>
            <tbody>
              {list === null ? (
                <TableRowSkeleton cols={8} rows={6} />
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <Empty
                      icon={Boxes}
                      title="Belum ada stok"
                      hint="Paste teks atau import .txt untuk menambah stok."
                    />
                  </td>
                </tr>
              ) : (
                list.map((x) => (
                  <tr key={x.id}>
                    <td className="!p-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--color-brand-500)]"
                        checked={sel.has(x.id)}
                        disabled={x.status !== "available"}
                        onChange={(e) => {
                          const next = new Set(sel);
                          if (e.target.checked) next.add(x.id);
                          else next.delete(x.id);
                          setSel(next);
                        }}
                        aria-label="Pilih item"
                      />
                    </td>
                    <td>
                      <CopyCell value={x.payload_email} icon={Mail} />
                    </td>
                    <td>
                      <CopyCell
                        value={x.payload_password}
                        icon={Lock}
                        masked={!showAllPwd}
                      />
                    </td>
                    <td className="text-xs text-[var(--color-ink-2)]">
                      {x.payload_note ? (
                        <span className="inline-flex items-center gap-1">
                          <StickyNote size={11} /> {x.payload_note}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-xs text-[var(--color-ink-2)]">
                      {x.payload_expiry ? (
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={11} /> {x.payload_expiry}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 " +
                          (STATUS_CLS[x.status] ?? "bg-[var(--color-surface-mute)] text-[var(--color-ink-2)] border-[var(--color-border)]")
                        }
                      >
                        {x.status}
                      </span>
                    </td>
                    <td className="text-[11px] text-[var(--color-ink-3)] font-mono">
                      {x.reserved_for_order_id ?? x.sold_to_order_id ?? "—"}
                    </td>
                    <td className="text-xs text-[var(--color-ink-2)] whitespace-nowrap">
                      {dateID(x.created_at, { dateStyle: "short" })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && (
          <div className="px-4 pb-3">
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={setPage}
            />
          </div>
        )}
      </section>

      {/* Floating action bar saat ada selection */}
      {sel.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 card !shadow-[var(--shadow-modal)] px-4 py-3 flex items-center gap-3 z-40 animate-slide-up">
          <span className="text-sm font-bold text-[var(--color-ink)]">
            {sel.size} dipilih
          </span>
          <Button
            variant="danger"
            icon={Trash2}
            size="sm"
            onClick={() => setConfirmDeleteOpen(true)}
          >
            Hapus stok
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSel(new Set())}>
            Batal
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Hapus ${sel.size} item stok?`}
        tone="danger"
        icon={Trash2}
        confirmLabel="Hapus permanen"
        description="Item stok yang dipilih akan dihapus permanen dari database. Hanya item berstatus available yang terhapus; item reserved (order berjalan) & sold (sudah dibeli user) tidak terpengaruh."
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={() => deleteStock(Array.from(sel))}
      />
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "amber" | "sky" | "rose";
}) {
  const cls =
    tone === "emerald"
      ? "bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)] border-[color-mix(in_srgb,var(--color-success)_32%,transparent)]"
      : tone === "amber"
        ? "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_32%,transparent)]"
        : tone === "sky"
          ? "bg-[var(--color-surface-tint)] text-[var(--color-brand-700)] border-sky-200"
          : tone === "rose"
            ? "bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)] border-[color-mix(in_srgb,var(--color-danger)_32%,transparent)]"
            : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-ink)]";
  return (
    <div className={"rounded-lg border p-3 " + cls}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</div>
      <div
        className="font-extrabold text-xl tabular-nums mt-0.5"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {value.toLocaleString("id-ID")}
      </div>
    </div>
  );
}

function CopyCell({
  value,
  icon: Icon,
  masked,
}: {
  value: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
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
      <span className="font-mono text-xs text-[var(--color-ink)] truncate max-w-[220px]">
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
