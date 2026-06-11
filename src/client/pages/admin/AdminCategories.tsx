import { cloneElement, isValidElement, useEffect, useId, useState } from "react";
import { Shapes, Plus, Pencil, Trash2, X, Hash, Type as TypeIcon } from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { Button, IconButton } from "../../components/Button";
import { ListRowSkeleton } from "../../components/Loading";
import { Empty } from "../../components/Empty";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useBackdropClose, useModalEffects } from "../../lib/hooks";
import { categoryIcon } from "../../lib/category-icons";

interface CatRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
}

export default function AdminCategories() {
  const [list, setList] = useState<CatRow[] | null>(null);
  const [edit, setEdit] = useState<CatRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<CatRow | null>(null);
  const toast = useToast();

  async function load() {
    setList(await api<CatRow[]>("/admin/categories/"));
  }
  useEffect(() => {
    load();
  }, []);

  async function save(c: CatRow, isNew: boolean) {
    setBusy(true);
    try {
      const payload = {
        slug: c.slug,
        name: c.name,
        description: c.description,
        icon: c.icon,
        sortOrder: c.sort_order,
      };
      if (isNew) {
        await api("/admin/categories/", { body: payload });
      } else {
        await api(`/admin/categories/${c.id}`, { method: "PUT", body: payload });
      }
      setEdit(null);
      toast.success("Kategori tersimpan.");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal simpan kategori.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: CatRow) {
    try {
      await api(`/admin/categories/${c.id}`, { method: "DELETE" });
      toast.success("Kategori dihapus.");
      setConfirmDel(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal hapus.");
      throw e;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
            <Shapes size={18} />
          </div>
          <h1
            className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Kategori
          </h1>
        </div>
        <Button
          icon={Plus}
          onClick={() =>
            setEdit({ id: "", slug: "", name: "", description: "", icon: "", sort_order: 0 })
          }
        >
          Kategori baru
        </Button>
      </div>

      {list === null ? (
        <ul className="card divide-y divide-[var(--color-border)]">
          <ListRowSkeleton rows={5} />
        </ul>
      ) : list.length === 0 ? (
        <Empty
          icon={Shapes}
          title="Belum ada kategori"
          hint="Buat kategori untuk mengelompokkan produk di katalog."
          action={
            <Button
              icon={Plus}
              onClick={() =>
                setEdit({ id: "", slug: "", name: "", description: "", icon: "", sort_order: 0 })
              }
            >
              Kategori pertama
            </Button>
          }
        />
      ) : (
        <ul className="card divide-y divide-[var(--color-border)]">
          {list.map((c) => {
            const CIcon = categoryIcon(c);
            return (
            <li key={c.id} className="p-3 sm:p-4 flex items-center gap-3">
              <div className="size-12 rounded-xl bg-[var(--color-surface-tint)] text-[var(--color-brand-700)] grid place-items-center shrink-0">
                <CIcon size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[var(--color-ink)] truncate">{c.name}</div>
                <div className="text-xs text-[var(--color-ink-3)] flex items-center gap-2 mt-0.5">
                  <span className="font-mono">/{c.slug}</span>
                  <span aria-hidden>·</span>
                  <span>urutan {c.sort_order}</span>
                </div>
                {c.description && (
                  <div className="text-xs text-[var(--color-ink-2)] mt-0.5 line-clamp-1">
                    {c.description}
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <IconButton icon={Pencil} label="Edit" onClick={() => setEdit(c)} />
                <IconButton
                  icon={Trash2}
                  label="Hapus"
                  className="hover:!bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:!text-[var(--color-danger)]"
                  onClick={() => setConfirmDel(c)}
                />
              </div>
            </li>
            );
          })}
        </ul>
      )}

      {edit && (
        <CategoryModal
          row={edit}
          busy={busy}
          onChange={setEdit}
          onClose={() => setEdit(null)}
          onSave={() => save(edit, !edit.id)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title={confirmDel ? `Hapus kategori ${confirmDel.name}?` : "Hapus kategori"}
        tone="danger"
        confirmLabel="Hapus kategori"
        description="Backend menolak penghapusan jika masih ada produk pada kategori ini. Pindahkan produk ke kategori lain terlebih dulu bila perlu."
        onClose={() => setConfirmDel(null)}
        onConfirm={() => (confirmDel ? remove(confirmDel) : Promise.resolve())}
      />
    </div>
  );
}

function CategoryModal({
  row,
  busy,
  onChange,
  onClose,
  onSave,
}: {
  row: CatRow;
  busy: boolean;
  onChange: (r: CatRow) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const isNew = !row.id;
  useModalEffects(true, () => {
    if (!busy) onClose();
  });
  const onBackdropClick = useBackdropClose(() => {
    if (!busy) onClose();
  });
  return (
    <div
      className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4 animate-fade-in"
      onMouseDown={onBackdropClick}
    >
      <div
        className="card max-w-md w-full p-5 sm:p-6 my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto animate-scale-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="size-10 rounded-xl bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
              {isNew ? <Plus size={20} /> : <Pencil size={20} />}
            </div>
            <div className="font-extrabold text-lg text-[var(--color-ink)]">
              {isNew ? "Kategori baru" : "Edit kategori"}
            </div>
          </div>
          <IconButton icon={X} label="Tutup" onClick={onClose} />
        </div>
        <div className="space-y-3">
          <Field label="Nama" icon={TypeIcon}>
            <input
              className="input !pl-9"
              value={row.name}
              maxLength={80}
              onChange={(e) => onChange({ ...row, name: e.target.value })}
              placeholder="Streaming & Hiburan"
            />
          </Field>
          <Field label="Slug" icon={Hash}>
            <input
              className="input !pl-9 font-mono"
              value={row.slug}
              maxLength={64}
              onChange={(e) =>
                onChange({
                  ...row,
                  slug: e.target.value
                    .toLowerCase()
                    .replace(/\s+/g, "-")
                    .replace(/[^a-z0-9-]/g, ""),
                })
              }
              placeholder="streaming-hiburan"
            />
          </Field>
          <div className="rounded-xl bg-[var(--color-surface-tint)] border border-[var(--color-border)] p-3 text-xs text-[var(--color-ink-2)] leading-relaxed">
            Ikon kategori kini otomatis dipilih dari ikon vektor berdasarkan nama/slug, jadi tidak
            perlu mengisi emoji manual lagi.
          </div>
          <div>
            <label className="label" htmlFor="cat-desc">Deskripsi</label>
            <textarea
              id="cat-desc"
              className="textarea"
              value={row.description ?? ""}
              onChange={(e) => onChange({ ...row, description: e.target.value })}
              placeholder="Deskripsi singkat tentang kategori ini."
              maxLength={300}
            />
          </div>
          <div>
            <label className="label" htmlFor="cat-sort">Urutan tampilan</label>
            <input
              id="cat-sort"
              className="input"
              type="number"
              min={0}
              max={9999}
              value={row.sort_order}
              onChange={(e) =>
                onChange({ ...row, sort_order: parseInt(e.target.value || "0", 10) })
              }
            />
            <div className="help-text">Angka kecil tampil duluan.</div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button onClick={onSave} loading={busy}>
            Simpan kategori
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  const autoId = useId();
  const el = isValidElement(children) ? (children as React.ReactElement<{ id?: string }>) : null;
  const id = el?.props.id ?? autoId;
  return (
    <div>
      <label className="label" htmlFor={el ? id : undefined}>
        {label}
      </label>
      <div className="relative">
        <Icon
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] pointer-events-none"
        />
        {el ? cloneElement(el, { id }) : children}
      </div>
    </div>
  );
}
