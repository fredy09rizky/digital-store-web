import { cloneElement, isValidElement, useEffect, useId, useState } from "react";
import {
  Package,
  Plus,
  Search,
  Pencil,
  Trash2,
  Boxes,
  X,
  Image as ImageIcon,
  Save,
  Layers,
  AlertTriangle,
  Star,
  ShieldCheck,
} from "lucide-react";
import { api } from "../../lib/api";
import { rupiah } from "../../lib/format";
import { useToast } from "../../components/Toast";
import { Button, IconButton, LinkButton } from "../../components/Button";
import { TableRowSkeleton } from "../../components/Loading";
import { Empty } from "../../components/Empty";
import { Modal } from "../../components/Modal";
import { AdminConfirm } from "./AdminConfirm";
import { adminConfirmPassword } from "./admin-session";

interface Cat {
  id: string;
  name: string;
}
interface Prow {
  id: string;
  sku: string;
  name: string;
  slug: string;
  category_id: string;
  category_name: string;
  thumbnail_url: string | null;
  price_cents: number;
  sale_price_cents: number | null;
  duration_label: string | null;
  warranty_note: string | null;
  description: string;
  status: string;
  is_featured: number;
  stk: number;
  rsv: number;
}

interface PEdit {
  id?: string;
  categoryId: string;
  name: string;
  description: string;
  thumbnailUrl: string;
  priceCents: number;
  salePriceCents: number | null;
  durationLabel: string;
  warrantyNote: string;
  isFeatured: boolean;
  status: "active" | "hidden";
  priceTiers: { minQty: number; unitPriceCents: number }[];
  imageUrls: string[];
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_GALLERY_IMAGES = 5;

/** Validasi sisi klien sebelum upload: tipe & ukuran. Return pesan error atau null bila valid. */
function validateImageFile(f: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(f.type)) {
    return "Format tidak didukung. Pakai PNG, JPG, WEBP, atau GIF.";
  }
  if (f.size > MAX_IMAGE_BYTES) {
    return `Ukuran maksimal 2 MB. File ini ${(f.size / 1024 / 1024).toFixed(1)} MB.`;
  }
  return null;
}

export default function AdminProducts() {
  const [list, setList] = useState<Prow[] | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [edit, setEdit] = useState<PEdit | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [confirmDel, setConfirmDel] = useState<Prow | null>(null);
  const toast = useToast();

  async function load() {
    const url = q ? `/admin/products/?q=${encodeURIComponent(q)}` : "/admin/products/";
    setList(await api<Prow[]>(url));
  }
  useEffect(() => {
    load();
    api<Cat[]>("/admin/categories/").then(setCats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function newProduct() {
    setEdit({
      categoryId: cats[0]?.id ?? "",
      name: "",
      description: "",
      thumbnailUrl: "",
      priceCents: 0,
      salePriceCents: null,
      durationLabel: "",
      warrantyNote: "",
      isFeatured: false,
      status: "active",
      priceTiers: [],
      imageUrls: [],
    });
  }
  async function openEdit(p: Prow) {
    // Ambil detail lengkap (tier + galeri) supaya tidak hilang saat disimpan
    // ulang — PUT menulis ulang penuh kedua relasi tersebut.
    try {
      const full = await api<
        Prow & { priceTiers: { minQty: number; unitPriceCents: number }[]; imageUrls: string[] }
      >(`/admin/products/${p.id}`);
      setEdit({
        id: full.id,
        categoryId: full.category_id,
        name: full.name,
        description: full.description,
        thumbnailUrl: full.thumbnail_url ?? "",
        priceCents: full.price_cents,
        salePriceCents: full.sale_price_cents,
        durationLabel: full.duration_label ?? "",
        warrantyNote: full.warranty_note ?? "",
        isFeatured: !!full.is_featured,
        status: full.status as any,
        priceTiers: full.priceTiers ?? [],
        imageUrls: full.imageUrls ?? [],
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal memuat produk.");
    }
  }
  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      const payload = {
        categoryId: edit.categoryId,
        name: edit.name,
        description: edit.description,
        thumbnailUrl: edit.thumbnailUrl || null,
        priceCents: edit.priceCents,
        salePriceCents: edit.salePriceCents,
        durationLabel: edit.durationLabel || null,
        warrantyNote: edit.warrantyNote || null,
        isFeatured: edit.isFeatured,
        status: edit.status,
        priceTiers: edit.priceTiers,
        imageUrls: edit.imageUrls,
      };
      if (edit.id) {
        await api(`/admin/products/${edit.id}`, { method: "PUT", body: payload });
      } else {
        await api(`/admin/products/`, { body: payload });
      }
      toast.success("Produk tersimpan.");
      setEdit(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal simpan.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(p: Prow, ack: string) {
    try {
      await api(`/admin/products/${p.id}`, { method: "DELETE", body: { ack } });
      toast.success("Produk dihapus.");
      setConfirmDel(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal hapus.");
      throw e;
    }
  }

  async function uploadThumb(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const err = validateImageFile(f);
    if (err) {
      toast.error(err);
      e.target.value = "";
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("folder", "products");
      const r = await api<{ url: string }>("/admin/upload/", { formData: fd });
      setEdit((s) => (s ? { ...s, thumbnailUrl: r.url } : s));
      toast.success("Thumbnail diunggah.");
    } catch (er: any) {
      toast.error(er?.message ?? "Upload gagal.");
    } finally {
      e.target.value = "";
    }
  }

  async function uploadGallery(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    let count = edit?.imageUrls.length ?? 0;
    for (const f of Array.from(files)) {
      if (count >= MAX_GALLERY_IMAGES) {
        toast.error(`Maksimal ${MAX_GALLERY_IMAGES} gambar galeri.`);
        break;
      }
      const err = validateImageFile(f);
      if (err) {
        toast.error(`${f.name}: ${err}`);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("folder", "products");
        const r = await api<{ url: string }>("/admin/upload/", { formData: fd });
        setEdit((s) =>
          s ? { ...s, imageUrls: [...s.imageUrls, r.url].slice(0, MAX_GALLERY_IMAGES) } : s,
        );
        count += 1;
      } catch (er: any) {
        toast.error(er?.message ?? "Upload gambar gagal.");
      }
    }
    toast.success("Galeri diperbarui.");
    e.target.value = "";
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
            <Package size={18} />
          </div>
          <h1
            className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Produk
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] pointer-events-none"
            />
            <input
              className="input !pl-9 !text-sm !w-[220px]"
              placeholder="Cari nama produk"
              aria-label="Cari produk"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button icon={Plus} onClick={newProduct}>
            Produk baru
          </Button>
        </div>
      </div>

      {list === null ? (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col" className="!text-left">Produk</th>
                <th scope="col">Kategori</th>
                <th scope="col">Harga</th>
                <th scope="col">Stok</th>
                <th scope="col">Status</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              <TableRowSkeleton cols={6} rows={6} />
            </tbody>
          </table>
        </div>
      ) : list.length === 0 ? (
        <Empty
          icon={Package}
          title="Belum ada produk"
          hint="Tambah produk dan upload stok untuk mulai berjualan."
          action={
            <Button icon={Plus} onClick={newProduct}>
              Produk pertama
            </Button>
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col" className="!text-left">Produk</th>
                <th scope="col">Kategori</th>
                <th scope="col">Harga</th>
                <th scope="col">Stok</th>
                <th scope="col">Status</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const promo = p.sale_price_cents != null && p.sale_price_cents < p.price_cents;
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="size-12 rounded-lg overflow-hidden bg-[var(--color-surface-tint)] border border-[var(--color-border)] shrink-0">
                          {p.thumbnail_url ? (
                            <img src={p.thumbnail_url} className="size-full object-cover" alt="" />
                          ) : (
                            <div className="size-full grid place-items-center text-[var(--color-brand-300)]">
                              <Package size={16} />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-[var(--color-ink)] line-clamp-1 text-sm">
                            {p.name}
                            {!!p.is_featured && (
                              <Star
                                size={12}
                                className="inline ml-1 fill-amber-400 stroke-amber-400"
                                aria-label="Featured"
                              />
                            )}
                          </div>
                          <div
                            className="text-[11px] text-[var(--color-ink-3)] font-mono truncate"
                            style={{ fontFamily: "var(--font-ui)" }}
                          >
                            {p.sku}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="text-sm text-[var(--color-ink-2)]">{p.category_name}</td>
                    <td>
                      {promo ? (
                        <div>
                          <div
                            className="font-bold text-[var(--color-accent-500)] tabular-nums"
                            style={{ fontFamily: "var(--font-ui)" }}
                          >
                            {rupiah(p.sale_price_cents!)}
                          </div>
                          <div className="text-[11px] text-[var(--color-ink-3)] line-through tabular-nums">
                            {rupiah(p.price_cents)}
                          </div>
                        </div>
                      ) : (
                        <div
                          className="font-bold text-[var(--color-ink)] tabular-nums"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {rupiah(p.price_cents)}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="text-sm font-bold text-[var(--color-ink)]">{p.stk}</div>
                      {p.rsv > 0 && (
                        <div className="text-[11px] text-[var(--color-warning)] inline-flex items-center gap-1">
                          <AlertTriangle size={10} />
                          {p.rsv} reserved
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 " +
                          (p.status === "active"
                            ? "bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)] border-[color-mix(in_srgb,var(--color-success)_32%,transparent)]"
                            : "bg-[var(--color-surface-mute)] text-[var(--color-ink-2)] border-[var(--color-border)]")
                        }
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <LinkButton
                          to={`/admin/stok/${p.id}`}
                          variant="ghost"
                          size="sm"
                          icon={Boxes}
                        >
                          Stok
                        </LinkButton>
                        <IconButton icon={Pencil} label="Edit" onClick={() => openEdit(p)} />
                        <IconButton
                          icon={Trash2}
                          label="Hapus"
                          className="hover:!bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:!text-[var(--color-danger)]"
                          onClick={() => setConfirmDel(p)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <ProductModal
          edit={edit}
          cats={cats}
          busy={busy}
          onChange={setEdit}
          onClose={() => setEdit(null)}
          onSave={save}
          onUploadThumb={uploadThumb}
          onUploadGallery={uploadGallery}
        />
      )}

      <AdminConfirm
        open={!!confirmDel}
        title={confirmDel ? `Hapus produk ${confirmDel.name}?` : "Hapus produk"}
        description="Produk akan dihapus dari katalog beserta gambar dan tier harganya. Stok yang masih reserved akan menahan penghapusan."
        destructive
        requirePassword
        confirmLabel="Hapus produk"
        fields={[]}
        onClose={() => setConfirmDel(null)}
        onSubmit={async (values) => {
          if (!confirmDel) return;
          const ack = await adminConfirmPassword(values.__password);
          await remove(confirmDel, ack);
        }}
      />
    </div>
  );
}

function ProductModal({
  edit,
  cats,
  busy,
  onChange,
  onClose,
  onSave,
  onUploadThumb,
  onUploadGallery,
}: {
  edit: PEdit;
  cats: Cat[];
  busy: boolean;
  onChange: (e: PEdit) => void;
  onClose: () => void;
  onSave: () => void;
  onUploadThumb: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUploadGallery: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const saleInvalid =
    edit.salePriceCents != null &&
    edit.priceCents > 0 &&
    edit.salePriceCents >= edit.priceCents;
  const nameInvalid = edit.name.trim().length < 2;
  const canSave = !saleInvalid && !nameInvalid;
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      scrollable
      closeOnBackdrop={!busy}
      icon={edit.id ? Pencil : Plus}
      title={edit.id ? "Edit produk" : "Produk baru"}
      description="Backend memvalidasi ulang harga & stok saat checkout."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button onClick={onSave} icon={Save} loading={busy} disabled={!canSave}>
            Simpan produk
          </Button>
        </>
      }
    >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nama">
            <input
              className="input"
              value={edit.name}
              onChange={(e) => onChange({ ...edit, name: e.target.value })}
              placeholder="Mis. Netflix Premium 1 Bulan"
            />
          </Field>
          <Field label="Kategori">
            <select
              className="select-input"
              value={edit.categoryId}
              onChange={(e) => onChange({ ...edit, categoryId: e.target.value })}
            >
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Harga normal (Rp)">
            <input
              className="input tabular-nums"
              type="number"
              min={0}
              max={1_000_000_000}
              value={edit.priceCents}
              onChange={(e) =>
                onChange({ ...edit, priceCents: parseInt(e.target.value || "0", 10) })
              }
            />
            {edit.priceCents > 0 && (
              <div className="help-text">{rupiah(edit.priceCents)}</div>
            )}
          </Field>
          <Field label="Harga promo (Rp, kosong = tidak)">
            <input
              className={"input tabular-nums " + (saleInvalid ? "!border-[var(--color-danger)]" : "")}
              type="number"
              min={0}
              max={1_000_000_000}
              value={edit.salePriceCents ?? ""}
              onChange={(e) =>
                onChange({
                  ...edit,
                  salePriceCents: e.target.value ? parseInt(e.target.value, 10) : null,
                })
              }
            />
            {saleInvalid ? (
              <div className="error-text">Harga promo harus lebih kecil dari harga normal.</div>
            ) : edit.salePriceCents != null && edit.salePriceCents > 0 ? (
              <div className="help-text">{rupiah(edit.salePriceCents)}</div>
            ) : null}
          </Field>
          <Field label="Durasi">
            <input
              className="input"
              placeholder="contoh: 1 bulan / permanen"
              value={edit.durationLabel}
              maxLength={40}
              onChange={(e) => onChange({ ...edit, durationLabel: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <select
              className="select-input"
              value={edit.status}
              onChange={(e) => onChange({ ...edit, status: e.target.value as any })}
            >
              <option value="active">Aktif</option>
              <option value="hidden">Tersembunyi</option>
            </select>
          </Field>
        </div>

        <Field label="Deskripsi">
          <textarea
            className="textarea !min-h-[120px]"
            value={edit.description}
            onChange={(e) => onChange({ ...edit, description: e.target.value })}
            placeholder="Detail spesifikasi, fitur, syarat, dll. (≤ 2000 karakter). Juga dipakai untuk pencarian."
            maxLength={2000}
          />
        </Field>
        <Field label="Catatan garansi">
          <textarea
            className="textarea !min-h-[80px]"
            value={edit.warrantyNote}
            onChange={(e) => onChange({ ...edit, warrantyNote: e.target.value })}
            placeholder="Mis. Garansi 7 hari, replacement jika invalid."
            maxLength={500}
          />
        </Field>

        <Field label="Thumbnail">
          <div className="flex items-center gap-3">
            {edit.thumbnailUrl ? (
              <div className="relative">
                <img
                  src={edit.thumbnailUrl}
                  alt="Thumbnail"
                  className="size-20 rounded-lg object-cover border border-[var(--color-border)]"
                />
                <button
                  onClick={() => onChange({ ...edit, thumbnailUrl: "" })}
                  className="absolute -top-2 -right-2 size-6 grid place-items-center rounded-full bg-[var(--color-danger)] text-white shadow"
                  type="button"
                  aria-label="Hapus thumbnail"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="size-20 rounded-lg border-2 border-dashed border-[var(--color-border)] grid place-items-center text-[var(--color-ink-3)]">
                <ImageIcon size={20} />
              </div>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={onUploadThumb}
              className="block text-sm text-[var(--color-ink-2)] file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:uppercase file:tracking-wider file:bg-[var(--color-brand-500)] file:text-white hover:file:bg-[var(--color-brand-700)] file:cursor-pointer"
            />
          </div>
          <div className="help-text">Ukuran maksimal 2 MB (png/jpg/webp/gif).</div>
        </Field>

        <Field label="Galeri gambar" icon={ImageIcon}>
          <div className="flex flex-wrap gap-2">
            {edit.imageUrls.map((url, i) => (
              <div key={i} className="relative">
                <img
                  src={url}
                  alt={`Galeri ${i + 1}`}
                  className="size-20 rounded-lg object-cover border border-[var(--color-border)]"
                />
                <button
                  onClick={() =>
                    onChange({ ...edit, imageUrls: edit.imageUrls.filter((_, j) => j !== i) })
                  }
                  className="absolute -top-2 -right-2 size-6 grid place-items-center rounded-full bg-[var(--color-danger)] text-white shadow"
                  type="button"
                  aria-label={`Hapus gambar ${i + 1}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {edit.imageUrls.length < MAX_GALLERY_IMAGES && (
              <label className="size-20 rounded-lg border-2 border-dashed border-[var(--color-border)] grid place-items-center text-[var(--color-ink-3)] cursor-pointer hover:border-[var(--color-brand-500)] hover:text-[var(--color-brand-700)]">
                <Plus size={20} />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  onChange={onUploadGallery}
                  className="hidden"
                />
              </label>
            )}
          </div>
          <div className="help-text">Maksimal 5 gambar, masing-masing ≤ 2 MB (png/jpg/webp/gif).</div>
        </Field>

        <div className="flex items-center gap-3 mt-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--color-ink)]">
            <input
              type="checkbox"
              checked={edit.isFeatured}
              onChange={(e) => onChange({ ...edit, isFeatured: e.target.checked })}
              className="size-4 accent-[var(--color-brand-500)]"
            />
            <Star size={14} className="text-amber-500" />
            Tampilkan sebagai produk featured
          </label>
        </div>

        <Field label="Harga grosir (tier)" icon={Layers}>
          <div className="space-y-2">
            {edit.priceTiers.map((t, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-ink-3)] mb-1">
                    Min qty
                  </div>
                  <input
                    className="input tabular-nums"
                    type="number"
                    min={2}
                    value={t.minQty}
                    onChange={(e) =>
                      onChange({
                        ...edit,
                        priceTiers: edit.priceTiers.map((x, j) =>
                          j === i ? { ...x, minQty: parseInt(e.target.value || "0", 10) } : x,
                        ),
                      })
                    }
                  />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-ink-3)] mb-1">
                    Harga / pcs
                  </div>
                  <input
                    className="input tabular-nums"
                    type="number"
                    min={0}
                    value={t.unitPriceCents}
                    onChange={(e) =>
                      onChange({
                        ...edit,
                        priceTiers: edit.priceTiers.map((x, j) =>
                          j === i
                            ? { ...x, unitPriceCents: parseInt(e.target.value || "0", 10) }
                            : x,
                        ),
                      })
                    }
                  />
                </div>
                <IconButton
                  icon={Trash2}
                  label="Hapus tier"
                  className="hover:!bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:!text-[var(--color-danger)]"
                  onClick={() =>
                    onChange({ ...edit, priceTiers: edit.priceTiers.filter((_, j) => j !== i) })
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={Plus}
              onClick={() =>
                onChange({
                  ...edit,
                  priceTiers: [
                    ...edit.priceTiers,
                    { minQty: 5, unitPriceCents: edit.priceCents },
                  ],
                })
              }
            >
              Tambah tier
            </Button>
          </div>
        </Field>

        <div className="flex items-start gap-2 text-[11px] text-[var(--color-ink-2)] bg-[var(--color-surface-tint)] border border-[var(--color-brand-200)] rounded-lg p-3 mt-3">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[var(--color-brand-700)]" />
          <p>
            Edit dikunci jika produk masih punya reservasi aktif. Tunggu order pending expired atau
            cancel order itu lebih dulu.
          </p>
        </div>
    </Modal>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  const autoId = useId();
  const el = isValidElement(children) ? (children as React.ReactElement<{ id?: string }>) : null;
  const id = el?.props.id ?? autoId;
  return (
    <div className="mt-3">
      <label className="label inline-flex items-center gap-1.5" htmlFor={el ? id : undefined}>
        {Icon && <Icon size={13} className="text-[var(--color-brand-700)]" />}
        {label}
      </label>
      {el ? cloneElement(el, { id }) : children}
    </div>
  );
}
