import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Boxes,
  Upload,
  FileUp,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { dateID } from "../../lib/format";
import { Button } from "../../components/Button";
import { Empty } from "../../components/Empty";
import { TableRowSkeleton } from "../../components/Loading";
import { Pagination } from "../../components/Pagination";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import {
  splitStockInput,
  STOCK_ITEM_MAX_CHARS,
  STOCK_BULK_MAX_ITEMS,
  type StockSeparator,
} from "@shared/stock";

interface ItemRow {
  id: string;
  content: string;
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
  maxStock: number;
  remaining: number;
}

const STATUS_CLS: Record<string, string> = {
  available:
    "bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)] border-[color-mix(in_srgb,var(--color-success)_32%,transparent)]",
  reserved:
    "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_32%,transparent)]",
  sold: "bg-[var(--color-surface-tint)] text-[var(--color-brand-700)] border-sky-200",
};

export default function AdminStock() {
  const { productId } = useParams();
  const [data, setData] = useState<StockResponse | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Input stok
  const [mode, setMode] = useState<"single" | "multiple">("single");
  const [singleText, setSingleText] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [separator, setSeparator] = useState<StockSeparator>("newline");
  const [customToken, setCustomToken] = useState("===STOK===");

  const toast = useToast();

  const PAGE_SIZE = 50;
  const list = data?.items ?? null;
  const stats = data?.stats ?? null;
  const remaining = data?.remaining ?? null;

  async function load() {
    const r = await api<StockResponse>(
      `/admin/products/${productId}/stock?page=${page}&page_size=${PAGE_SIZE}`,
    );
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

  // Pratinjau pemecahan untuk mode multiple (identik dengan logika server).
  const preview = useMemo(
    () =>
      mode === "multiple"
        ? splitStockInput(bulkText, "multiple", separator, customToken)
        : splitStockInput(singleText, "single"),
    [mode, bulkText, singleText, separator, customToken],
  );

  const overQuota = remaining != null && preview.items.length > remaining;
  const overCap = preview.items.length > STOCK_BULK_MAX_ITEMS;
  const canSubmit =
    !busy &&
    preview.items.length > 0 &&
    preview.tooLong.length === 0 &&
    !overCap &&
    !overQuota;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const r = await api<{ added: number }>("/admin/products/stock/upload", {
        body:
          mode === "single"
            ? { productId, text: singleText, mode: "single" }
            : { productId, text: bulkText, mode: "multiple", separator, customToken },
      });
      toast.success(`${r.added} stok ditambahkan.`);
      setSingleText("");
      setBulkText("");
      if (page !== 1) setPage(1);
      else load();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal menambah stok.");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const txt = await f.text();
    setMode("multiple");
    setBulkText(txt);
    e.target.value = "";
    toast.info("File dimuat. Periksa pratinjau lalu klik Tambah.");
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

      {/* Tambah stok */}
      <section className="card p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <Upload size={16} className="text-[var(--color-brand-700)]" />
            <div className="font-bold text-[var(--color-ink)]">Tambah stok</div>
          </div>
          {data && (
            <div className="text-xs text-[var(--color-ink-2)]">
              Sisa kuota:{" "}
              <span className="font-bold text-[var(--color-ink)] tabular-nums">
                {data.remaining.toLocaleString("id-ID")}
              </span>{" "}
              dari maks {data.maxStock.toLocaleString("id-ID")}
            </div>
          )}
        </div>

        <div className="rounded-lg bg-[var(--color-surface-tint)] border border-[var(--color-brand-200)] p-3 text-xs text-[var(--color-ink)] leading-relaxed">
          Stok disimpan <b>apa adanya</b> (tanpa diparse) — bebas formatnya: akun, kode,
          link, atau teks panjang. Maksimal{" "}
          <b>{STOCK_ITEM_MAX_CHARS.toLocaleString("id-ID")} karakter</b> per stok.
        </div>

        {/* Mode toggle */}
        <div className="inline-flex rounded-lg border border-[var(--color-border)] p-0.5 bg-[var(--color-surface-soft)]">
          {(["single", "multiple"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                "px-3.5 py-1.5 rounded-md text-sm font-semibold transition " +
                (mode === m
                  ? "bg-[var(--color-surface)] text-[var(--color-brand-700)] shadow-[var(--shadow-card)]"
                  : "text-[var(--color-ink-2)] hover:text-[var(--color-ink)]")
              }
            >
              {m === "single" ? "Satu stok" : "Banyak stok"}
            </button>
          ))}
        </div>

        {mode === "single" ? (
          <div className="space-y-1.5">
            <textarea
              className="textarea !min-h-[160px] !font-mono !text-xs"
              placeholder={"Tempel data 1 stok di sini (bebas formatnya)."}
              value={singleText}
              onChange={(e) => setSingleText(e.target.value)}
              maxLength={STOCK_ITEM_MAX_CHARS}
            />
            <CharCount value={singleText.length} max={STOCK_ITEM_MAX_CHARS} />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-semibold text-[var(--color-ink-2)]">
                Pisahkan per
              </label>
              <select
                className="select-input !w-auto !py-1.5 !text-sm"
                value={separator}
                onChange={(e) => setSeparator(e.target.value as StockSeparator)}
              >
                <option value="newline">Baris baru (1 baris = 1 stok)</option>
                <option value="blankline">Baris kosong</option>
                <option value="custom">Penanda khusus</option>
              </select>
              {separator === "custom" && (
                <input
                  className="input !w-auto !py-1.5 !text-sm font-mono"
                  value={customToken}
                  onChange={(e) => setCustomToken(e.target.value)}
                  placeholder="===STOK==="
                  aria-label="Token pemisah"
                />
              )}
            </div>
            {separator === "custom" && (
              <div className="text-[11px] text-[var(--color-ink-3)]">
                Taruh baris berisi <code className="font-mono">{customToken || "(token)"}</code>{" "}
                di antara tiap stok. Cocok untuk data multi-baris.
              </div>
            )}
            <textarea
              className="textarea !min-h-[200px] !font-mono !text-xs"
              placeholder={
                separator === "newline"
                  ? "satu-stok-per-baris-1\nsatu-stok-per-baris-2\nsatu-stok-per-baris-3"
                  : separator === "blankline"
                    ? "stok pertama (boleh beberapa baris)\n\nstok kedua\n\nstok ketiga"
                    : `stok pertama (boleh multi-baris)\n${customToken || "===STOK==="}\nstok kedua`
              }
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />

            {/* Pratinjau */}
            {bulkText.trim() && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3 text-xs space-y-1.5">
                <div className="font-semibold text-[var(--color-ink)]">
                  Terdeteksi{" "}
                  <span className="tabular-nums text-[var(--color-brand-700)]">
                    {preview.items.length.toLocaleString("id-ID")}
                  </span>{" "}
                  stok
                </div>
                {preview.tooLong.length > 0 && (
                  <PreviewWarn>
                    Stok ke-{preview.tooLong.join(", ")} melebihi{" "}
                    {STOCK_ITEM_MAX_CHARS.toLocaleString("id-ID")} karakter.
                  </PreviewWarn>
                )}
                {overCap && (
                  <PreviewWarn>
                    Melebihi batas {STOCK_BULK_MAX_ITEMS.toLocaleString("id-ID")} stok per sekali
                    input. Bagi jadi beberapa kali.
                  </PreviewWarn>
                )}
                {overQuota && (
                  <PreviewWarn>
                    Melebihi sisa kuota ({remaining?.toLocaleString("id-ID")}). Kurangi jumlah stok.
                  </PreviewWarn>
                )}
                {preview.items.length > 0 &&
                  preview.tooLong.length === 0 &&
                  !overCap &&
                  !overQuota && (
                    <div className="text-[var(--color-ink-2)]">
                      Contoh stok pertama:{" "}
                      <span className="font-mono">
                        {preview.items[0].slice(0, 80)}
                        {preview.items[0].length > 80 ? "…" : ""}
                      </span>
                    </div>
                  )}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={submit} loading={busy} disabled={!canSubmit} icon={Plus}>
            {mode === "single"
              ? "Tambah 1 stok"
              : `Tambah ${preview.items.length.toLocaleString("id-ID")} stok`}
          </Button>
          <label className="btn-outline cursor-pointer">
            <FileUp size={16} />
            <span>Import .txt</span>
            <input type="file" accept=".txt,text/plain" onChange={importFile} className="hidden" />
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
            icon={showAll ? EyeOff : Eye}
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Sembunyikan" : "Tampilkan"} konten
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
                        setSel(
                          new Set(list.filter((x) => x.status === "available").map((x) => x.id)),
                        );
                      } else {
                        setSel(new Set());
                      }
                    }}
                    aria-label="Pilih semua available"
                  />
                </th>
                <th className="!text-left">Konten</th>
                <th>Status</th>
                <th>Order</th>
                <th>Dibuat</th>
              </tr>
            </thead>
            <tbody>
              {list === null ? (
                <TableRowSkeleton cols={5} rows={6} />
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <Empty
                      icon={Boxes}
                      title="Belum ada stok"
                      hint="Tambahkan stok lewat mode Satu/Banyak di atas."
                    />
                  </td>
                </tr>
              ) : (
                list.map((x) => (
                  <tr key={x.id}>
                    <td className="!p-2 align-top">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--color-brand-500)] mt-1"
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
                      <ContentCell value={x.content} reveal={showAll} />
                    </td>
                    <td className="align-top">
                      <span
                        className={
                          "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 " +
                          (STATUS_CLS[x.status] ??
                            "bg-[var(--color-surface-mute)] text-[var(--color-ink-2)] border-[var(--color-border)]")
                        }
                      >
                        {x.status}
                      </span>
                    </td>
                    <td className="text-[11px] text-[var(--color-ink-3)] font-mono align-top">
                      {x.reserved_for_order_id ?? x.sold_to_order_id ?? "—"}
                    </td>
                    <td className="text-xs text-[var(--color-ink-2)] whitespace-nowrap align-top">
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
          <span className="text-sm font-bold text-[var(--color-ink)]">{sel.size} dipilih</span>
          <Button variant="danger" icon={Trash2} size="sm" onClick={() => setConfirmDeleteOpen(true)}>
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

function CharCount({ value, max }: { value: number; max: number }) {
  const over = value > max;
  return (
    <div
      className={
        "text-[11px] text-right tabular-nums " +
        (over ? "text-[var(--color-danger)] font-bold" : "text-[var(--color-ink-3)]")
      }
    >
      {value.toLocaleString("id-ID")}/{max.toLocaleString("id-ID")}
    </div>
  );
}

function PreviewWarn({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-start gap-1.5 text-[var(--color-danger)] font-semibold">
      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
      <span>{children}</span>
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

// Sel konten stok: ringkas + bisa diperluas + salin. Disembunyikan (dots) bila
// toggle "Tampilkan konten" mati, karena konten bisa memuat kredensial.
function ContentCell({ value, reveal }: { value: string; reveal: boolean }) {
  const [expanded, setExpanded] = useState(false);
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
  if (!reveal) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-xs text-[var(--color-ink-3)]">••••••••••••</span>
        <button
          type="button"
          onClick={copy}
          className="text-[var(--color-ink-3)] hover:text-[var(--color-brand-700)] shrink-0"
          title="Salin"
          aria-label="Salin"
        >
          {copied ? <Check size={13} className="text-[var(--color-success)]" /> : <Copy size={13} />}
        </button>
      </div>
    );
  }
  const oneLine = value.replace(/\s+/g, " ").trim();
  const isLong = value.length > 70 || value.includes("\n");
  return (
    <div className="min-w-0 max-w-[520px]">
      <div className="flex items-start gap-2">
        {expanded ? (
          <pre className="font-mono text-xs text-[var(--color-ink)] whitespace-pre-wrap break-all flex-1 min-w-0 max-h-64 overflow-auto">
            {value}
          </pre>
        ) : (
          <span className="font-mono text-xs text-[var(--color-ink)] truncate flex-1 min-w-0">
            {oneLine}
          </span>
        )}
        <button
          type="button"
          onClick={copy}
          className="text-[var(--color-ink-3)] hover:text-[var(--color-brand-700)] shrink-0 mt-0.5"
          title="Salin"
          aria-label="Salin"
        >
          {copied ? <Check size={13} className="text-[var(--color-success)]" /> : <Copy size={13} />}
        </button>
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] font-semibold text-[var(--color-brand-700)] hover:underline mt-0.5"
        >
          {expanded ? "Tutup" : "Lihat selengkapnya"}
        </button>
      )}
    </div>
  );
}
