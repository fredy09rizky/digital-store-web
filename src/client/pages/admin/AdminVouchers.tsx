import { cloneElement, isValidElement, useEffect, useId, useState } from "react";
import {
  Ticket,
  Plus,
  Pencil,
  Trash2,
  Tag,
  Save,
  CheckCircle2,
  PowerOff,
  Hash,
  Calendar,
  Users,
  Layers,
} from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { dateID, rupiah } from "../../lib/format";
import { Button, IconButton } from "../../components/Button";
import { Empty } from "../../components/Empty";
import { TableRowSkeleton } from "../../components/Loading";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Modal } from "../../components/Modal";

interface VRow {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percent" | "amount";
  discount_value: number;
  max_discount_cents: number | null;
  min_subtotal_cents: number;
  scope_type: "all" | "category" | "product";
  scope_ref_id: string | null;
  total_quota: number | null;
  per_user_quota: number;
  used_count: number;
  active_from: number;
  active_until: number;
  is_active: number;
}

interface VEdit extends Omit<VRow, "is_active"> {
  is_active: boolean;
}

export default function AdminVouchers() {
  const [list, setList] = useState<VRow[] | null>(null);
  const [edit, setEdit] = useState<VEdit | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<VRow | null>(null);
  const toast = useToast();

  async function load() {
    setList(await api<VRow[]>("/admin/vouchers/"));
  }
  useEffect(() => {
    load();
  }, []);

  function newOne(): VEdit {
    const now = Math.floor(Date.now() / 1000);
    return {
      id: "",
      code: "",
      description: "",
      discount_type: "percent",
      discount_value: 10,
      max_discount_cents: null,
      min_subtotal_cents: 0,
      scope_type: "all",
      scope_ref_id: null,
      total_quota: null,
      per_user_quota: 1,
      used_count: 0,
      active_from: now,
      active_until: now + 7 * 86400,
      is_active: true,
    };
  }

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      const payload = {
        code: edit.code,
        description: edit.description ?? null,
        discountType: edit.discount_type,
        discountValue: edit.discount_value,
        maxDiscountCents: edit.max_discount_cents,
        minSubtotalCents: edit.min_subtotal_cents,
        scopeType: edit.scope_type,
        scopeRefId: edit.scope_ref_id,
        totalQuota: edit.total_quota,
        perUserQuota: edit.per_user_quota,
        activeFrom: edit.active_from,
        activeUntil: edit.active_until,
        isActive: edit.is_active,
      };
      if (edit.id) {
        await api(`/admin/vouchers/${edit.id}`, { method: "PUT", body: payload });
      } else {
        await api(`/admin/vouchers/`, { body: payload });
      }
      toast.success("Voucher tersimpan.");
      setEdit(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal simpan.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(v: VRow) {
    try {
      await api(`/admin/vouchers/${v.id}`, { method: "DELETE" });
      toast.success("Voucher dihapus.");
      setConfirmDel(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal hapus voucher.");
      throw e;
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
            <Ticket size={18} />
          </div>
          <h1
            className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Voucher
          </h1>
        </div>
        <Button icon={Plus} onClick={() => setEdit(newOne())}>
          Voucher baru
        </Button>
      </div>

      {list === null ? (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col" className="!text-left">Kode</th>
                <th scope="col">Diskon</th>
                <th scope="col">Kuota</th>
                <th scope="col">Berlaku</th>
                <th scope="col">Status</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              <TableRowSkeleton cols={6} rows={5} />
            </tbody>
          </table>
        </div>
      ) : list.length === 0 ? (
        <Empty
          icon={Ticket}
          title="Belum ada voucher"
          hint="Buat voucher pertama untuk memberi diskon ke pelanggan."
          action={
            <Button icon={Plus} onClick={() => setEdit(newOne())}>
              Voucher pertama
            </Button>
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col" className="!text-left">Kode</th>
                <th scope="col">Diskon</th>
                <th scope="col">Kuota</th>
                <th scope="col">Berlaku</th>
                <th scope="col">Status</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((v) => {
                const expired = v.active_until < Math.floor(Date.now() / 1000);
                const upcoming = v.active_from > Math.floor(Date.now() / 1000);
                return (
                  <tr key={v.id}>
                    <td>
                      <code
                        className="font-bold text-[var(--color-ink)] text-sm"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {v.code}
                      </code>
                      {v.description && (
                        <div className="text-[11px] text-[var(--color-ink-3)] mt-0.5 line-clamp-1 max-w-[260px]">
                          {v.description}
                        </div>
                      )}
                    </td>
                    <td>
                      <div
                        className="font-extrabold text-[var(--color-accent-500)] tabular-nums"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {v.discount_type === "percent"
                          ? `${v.discount_value}%`
                          : rupiah(v.discount_value)}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] font-bold">
                        scope: {v.scope_type}
                      </div>
                    </td>
                    <td className="text-xs">
                      <div className="font-semibold text-[var(--color-ink)]">
                        {v.used_count} / {v.total_quota ?? "∞"}
                      </div>
                      <div className="text-[var(--color-ink-3)]">
                        {v.per_user_quota} per user
                      </div>
                    </td>
                    <td className="text-xs text-[var(--color-ink-2)] whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <Calendar size={11} />
                        {dateID(v.active_from, { dateStyle: "short" })}
                      </div>
                      <div className="text-[var(--color-ink-3)]">
                        s/d {dateID(v.active_until, { dateStyle: "short" })}
                      </div>
                    </td>
                    <td>
                      {!v.is_active ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 bg-[var(--color-surface-mute)] text-[var(--color-ink-2)] border-[var(--color-border)]">
                          <PowerOff size={10} /> nonaktif
                        </span>
                      ) : expired ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)] border-[color-mix(in_srgb,var(--color-danger)_32%,transparent)]">
                          expired
                        </span>
                      ) : upcoming ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_32%,transparent)]">
                          upcoming
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)] border-[color-mix(in_srgb,var(--color-success)_32%,transparent)]">
                          <CheckCircle2 size={10} /> aktif
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton
                          icon={Pencil}
                          label="Edit"
                          onClick={() => setEdit({ ...v, is_active: !!v.is_active })}
                        />
                        <IconButton
                          icon={Trash2}
                          label="Hapus"
                          className="hover:!bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:!text-[var(--color-danger)]"
                          onClick={() => setConfirmDel(v)}
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
        <VoucherModal
          edit={edit}
          busy={busy}
          onChange={setEdit}
          onClose={() => setEdit(null)}
          onSave={save}
        />
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title={confirmDel ? `Hapus voucher ${confirmDel.code}?` : "Hapus voucher"}
        tone="danger"
        confirmLabel="Hapus voucher"
        description="Voucher akan dihapus dari katalog. Redemption yang sudah terjadi tetap tercatat di history order."
        onClose={() => setConfirmDel(null)}
        onConfirm={() => (confirmDel ? remove(confirmDel) : Promise.resolve())}
      />
    </div>
  );
}

function VoucherModal({
  edit,
  busy,
  onChange,
  onClose,
  onSave,
}: {
  edit: VEdit;
  busy: boolean;
  onChange: (e: VEdit) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const periodInvalid = edit.active_until <= edit.active_from;
  const percentInvalid = edit.discount_type === "percent" && edit.discount_value > 100;
  const valueInvalid = !Number.isFinite(edit.discount_value) || edit.discount_value < 1;
  const scopeRefMissing = edit.scope_type !== "all" && !edit.scope_ref_id?.trim();
  const codeInvalid = edit.code.trim().length < 2;
  const canSave =
    !periodInvalid && !percentInvalid && !valueInvalid && !scopeRefMissing && !codeInvalid;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      scrollable
      closeOnBackdrop={!busy}
      icon={edit.id ? Pencil : Plus}
      title={edit.id ? "Edit voucher" : "Voucher baru"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button onClick={onSave} icon={Save} loading={busy} disabled={!canSave}>
            Simpan voucher
          </Button>
        </>
      }
    >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Kode" icon={Hash}>
            <input
              className="input !pl-9 font-mono uppercase tracking-wider"
              value={edit.code}
              onChange={(e) => onChange({ ...edit, code: e.target.value.toUpperCase() })}
              placeholder="HEMAT10"
            />
          </Field>
          <Field label="Deskripsi" icon={Tag}>
            <input
              className="input !pl-9"
              value={edit.description ?? ""}
              maxLength={300}
              onChange={(e) => onChange({ ...edit, description: e.target.value })}
              placeholder="Deskripsi internal"
            />
          </Field>
          <FieldPlain label="Tipe diskon">
            <select
              className="select-input"
              value={edit.discount_type}
              onChange={(e) =>
                onChange({ ...edit, discount_type: e.target.value as any })
              }
            >
              <option value="percent">Persen (%)</option>
              <option value="amount">Nominal (Rp)</option>
            </select>
          </FieldPlain>
          <FieldPlain label={edit.discount_type === "percent" ? "Nilai (%)" : "Nilai (Rp)"}>
            <input
              className={"input tabular-nums " + (valueInvalid || percentInvalid ? "!border-[var(--color-danger)]" : "")}
              type="number"
              min={1}
              max={edit.discount_type === "percent" ? 100 : undefined}
              value={edit.discount_value}
              onChange={(e) =>
                onChange({ ...edit, discount_value: parseInt(e.target.value || "0", 10) })
              }
            />
            {percentInvalid ? (
              <div className="error-text">Diskon persen maksimal 100%.</div>
            ) : valueInvalid ? (
              <div className="error-text">Nilai minimal 1.</div>
            ) : edit.discount_type === "amount" && edit.discount_value > 0 ? (
              <div className="help-text">{rupiah(edit.discount_value)}</div>
            ) : null}
          </FieldPlain>
          <FieldPlain label="Max diskon (cap, hanya untuk %)">
            <input
              className="input tabular-nums"
              type="number"
              min={0}
              value={edit.max_discount_cents ?? ""}
              onChange={(e) =>
                onChange({
                  ...edit,
                  max_discount_cents: e.target.value ? parseInt(e.target.value, 10) : null,
                })
              }
              placeholder="kosong = tanpa cap"
            />
          </FieldPlain>
          <FieldPlain label="Min subtotal">
            <input
              className="input tabular-nums"
              type="number"
              min={0}
              value={edit.min_subtotal_cents}
              onChange={(e) =>
                onChange({
                  ...edit,
                  min_subtotal_cents: parseInt(e.target.value || "0", 10),
                })
              }
            />
          </FieldPlain>
          <Field label="Scope" icon={Layers}>
            <select
              className="select-input !pl-9"
              value={edit.scope_type}
              onChange={(e) => onChange({ ...edit, scope_type: e.target.value as any })}
            >
              <option value="all">Semua produk</option>
              <option value="category">Kategori</option>
              <option value="product">Produk tertentu</option>
            </select>
          </Field>
          <FieldPlain label="ID scope (opsional)">
            <input
              className={"input " + (scopeRefMissing ? "!border-[var(--color-danger)]" : "")}
              value={edit.scope_ref_id ?? ""}
              onChange={(e) => onChange({ ...edit, scope_ref_id: e.target.value || null })}
              placeholder={edit.scope_type === "all" ? "(tidak dipakai)" : "id kategori/produk"}
              disabled={edit.scope_type === "all"}
            />
            {scopeRefMissing && (
              <div className="error-text">Scope kategori/produk wajib mengisi ID referensi.</div>
            )}
          </FieldPlain>
          <FieldPlain label="Total kuota (kosong = ∞)">
            <input
              className="input tabular-nums"
              type="number"
              min={0}
              value={edit.total_quota ?? ""}
              onChange={(e) =>
                onChange({
                  ...edit,
                  total_quota: e.target.value ? parseInt(e.target.value, 10) : null,
                })
              }
            />
          </FieldPlain>
          <Field label="Per user kuota" icon={Users}>
            <input
              className="input !pl-9 tabular-nums"
              type="number"
              min={1}
              value={edit.per_user_quota}
              onChange={(e) =>
                onChange({ ...edit, per_user_quota: parseInt(e.target.value || "1", 10) })
              }
            />
          </Field>
          <Field label="Aktif dari" icon={Calendar}>
            <input
              className="input !pl-9"
              type="datetime-local"
              value={toLocal(edit.active_from)}
              onChange={(e) => onChange({ ...edit, active_from: fromLocal(e.target.value) })}
            />
          </Field>
          <Field label="Aktif sampai" icon={Calendar}>
            <input
              className={"input !pl-9 " + (periodInvalid ? "!border-[var(--color-danger)]" : "")}
              type="datetime-local"
              value={toLocal(edit.active_until)}
              onChange={(e) => onChange({ ...edit, active_until: fromLocal(e.target.value) })}
            />
            {periodInvalid && (
              <div className="error-text">Harus setelah tanggal "aktif dari".</div>
            )}
          </Field>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--color-ink)] sm:col-span-2 mt-2">
            <input
              type="checkbox"
              checked={edit.is_active}
              onChange={(e) => onChange({ ...edit, is_active: e.target.checked })}
              className="size-4 accent-[var(--color-brand-500)]"
            />
            <span className="font-semibold">Aktif (bisa dipakai user)</span>
          </label>
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
function FieldPlain({ label, children }: { label: string; children: React.ReactNode }) {
  const autoId = useId();
  const el = isValidElement(children) ? (children as React.ReactElement<{ id?: string }>) : null;
  const id = el?.props.id ?? autoId;
  return (
    <div>
      <label className="label" htmlFor={el ? id : undefined}>
        {label}
      </label>
      {el ? cloneElement(el, { id }) : children}
    </div>
  );
}

function toLocal(unix: number): string {
  const d = new Date(unix * 1000);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}
function fromLocal(s: string): number {
  if (!s) return 0;
  const d = new Date(s);
  return Math.floor(d.getTime() / 1000);
}
