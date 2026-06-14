import { useEffect, useId, useState, isValidElement, cloneElement } from "react";
import {
  Wrench,
  Building2,
  ReceiptText,
  Save,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  User as UserIcon,
  StickyNote,
  PowerOff,
  Power,
  ScrollText,
  Wallet,
  MessagesSquare,
} from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { Button } from "../../components/Button";
import { Loading } from "../../components/Loading";

interface Settings {
  maintenance_mode?: string;
  maintenance_message?: string;
  service_fee_cents?: string;
  manual_bank_enabled?: string;
  manual_bank_name?: string;
  manual_bank_account?: string;
  manual_bank_holder?: string;
  manual_bank_note?: string;
  audit_log_retention_days?: string;
  max_wallet_balance_cents?: string;
  chat_retention_hours?: string;
}

export default function AdminMaintenance() {
  const [s, setS] = useState<Settings | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const toast = useToast();

  async function load() {
    setS(await api<Settings>("/admin/settings/"));
  }
  useEffect(() => {
    load();
  }, []);

  async function save(key: keyof Settings, value: string) {
    setSavingKey(key);
    try {
      await api("/admin/settings/upsert", { body: { key, value } });
      toast.success("Tersimpan.");
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal simpan.");
    } finally {
      setSavingKey(null);
    }
  }

  if (!s) return <Loading label="Memuat pengaturan…" />;

  const isOn = s.maintenance_mode === "1";
  const bankOn = s.manual_bank_enabled === "1";

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2.5">
        <div className="size-9 rounded-lg bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
          <Wrench size={18} />
        </div>
        <h1
          className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Pengaturan sistem
        </h1>
      </div>

      {/* Maintenance mode */}
      <section className="card overflow-hidden">
        <div className={"px-5 py-4 flex items-center justify-between gap-3 " + (isOn ? "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] border-b border-[color-mix(in_srgb,var(--color-warning)_32%,transparent)]" : "border-b border-[var(--color-border)]")}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={
                "size-10 rounded-xl grid place-items-center shrink-0 " +
                (isOn ? "bg-[color-mix(in_srgb,var(--color-warning)_22%,transparent)] text-[var(--color-warning)]" : "bg-[var(--color-surface-soft)] text-[var(--color-ink-2)]")
              }
            >
              {isOn ? <AlertTriangle size={20} /> : <Wrench size={20} />}
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-[var(--color-ink)]">Maintenance mode</div>
              <div className="text-xs text-[var(--color-ink-2)] inline-flex items-center gap-1.5">
                {isOn ? (
                  <>
                    <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" /> Aktif —
                    checkout sedang ditutup
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={12} className="text-[var(--color-success)]" /> Nonaktif — sistem
                    operasional normal
                  </>
                )}
              </div>
            </div>
          </div>
          <Toggle
            on={isOn}
            onChange={async (next) => {
              setS({ ...s, maintenance_mode: next ? "1" : "0" });
              await save("maintenance_mode", next ? "1" : "0");
            }}
            tone={isOn ? "amber" : "default"}
            label="Aktifkan/nonaktifkan maintenance mode"
          />
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-[var(--color-ink-2)] leading-relaxed">
            Saat aktif, endpoint <code>/api/checkout</code> mengembalikan 503 dan banner kuning
            tampil di seluruh halaman. Katalog tetap terbuka, admin tetap bisa login dan mengelola
            data.
          </p>
          <div>
            <label className="label" htmlFor="set-maintenance-message">Pesan banner</label>
            <textarea
              id="set-maintenance-message"
              className="textarea"
              value={s.maintenance_message ?? ""}
              maxLength={1000}
              onChange={(e) => setS({ ...s, maintenance_message: e.target.value })}
              placeholder="Mis. Sistem checkout sedang dalam pemeliharaan singkat."
            />
            <Button
              icon={Save}
              size="sm"
              className="mt-2"
              loading={savingKey === "maintenance_message"}
              onClick={() => save("maintenance_message", s.maintenance_message ?? "")}
            >
              Simpan pesan
            </Button>
          </div>
        </div>
      </section>

      {/* Service fee */}
      <section className="card p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="size-10 rounded-xl bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
            <ReceiptText size={20} />
          </div>
          <div>
            <div className="font-extrabold text-[var(--color-ink)]">Biaya layanan</div>
            <div className="text-xs text-[var(--color-ink-2)]">
              Ditambahkan ke total order saat checkout.
            </div>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="set-service-fee">Biaya layanan (Rp per order)</label>
          <input
            id="set-service-fee"
            className="input"
            type="number"
            min={0}
            value={s.service_fee_cents ?? "0"}
            onChange={(e) => setS({ ...s, service_fee_cents: e.target.value })}
          />
          <Button
            icon={Save}
            size="sm"
            className="mt-2"
            loading={savingKey === "service_fee_cents"}
            onClick={() => save("service_fee_cents", s.service_fee_cents ?? "0")}
          >
            Simpan biaya
          </Button>
        </div>
      </section>

      {/* Batas saldo maksimal */}
      <section className="card p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="size-10 rounded-xl bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
            <Wallet size={20} />
          </div>
          <div>
            <div className="font-extrabold text-[var(--color-ink)]">Batas saldo maksimal</div>
            <div className="text-xs text-[var(--color-ink-2)]">
              Saldo user tidak boleh melebihi nilai ini lewat top up.
            </div>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="set-wallet-cap">Batas saldo (Rp)</label>
          <input
            id="set-wallet-cap"
            className="input tabular-nums"
            type="number"
            min={0}
            max={1_000_000_000}
            value={s.max_wallet_balance_cents ?? "1000000"}
            onChange={(e) => setS({ ...s, max_wallet_balance_cents: e.target.value })}
          />
          <div className="help-text">
            Maks 1x top up = batas saldo − (saldo user + top up yang masih pending). Set{" "}
            <code>0</code> untuk menonaktifkan batas. Refund &amp; penyesuaian admin tidak dibatasi
            oleh nilai ini.
          </div>
          <Button
            icon={Save}
            size="sm"
            className="mt-2"
            loading={savingKey === "max_wallet_balance_cents"}
            onClick={() => save("max_wallet_balance_cents", s.max_wallet_balance_cents ?? "1000000")}
          >
            Simpan batas saldo
          </Button>
        </div>
      </section>

      {/* Manual bank transfer */}
      <section className="card overflow-hidden">
        <div className={"px-5 py-4 flex items-center justify-between gap-3 border-b " + (bankOn ? "bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] border-[color-mix(in_srgb,var(--color-success)_32%,transparent)]" : "border-[var(--color-border)]")}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={
                "size-10 rounded-xl grid place-items-center shrink-0 " +
                (bankOn ? "bg-[color-mix(in_srgb,var(--color-success)_22%,transparent)] text-[var(--color-success)]" : "bg-[var(--color-surface-soft)] text-[var(--color-ink-2)]")
              }
            >
              <Building2 size={20} />
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-[var(--color-ink)]">Transfer bank manual</div>
              <div className="text-xs text-[var(--color-ink-2)] inline-flex items-center gap-1.5">
                {bankOn ? (
                  <>
                    <Power size={12} className="text-[var(--color-success)]" /> Tampil di checkout sebagai
                    metode bayar
                  </>
                ) : (
                  <>
                    <PowerOff size={12} /> Tidak ditampilkan ke pembeli
                  </>
                )}
              </div>
            </div>
          </div>
          <Toggle
            on={bankOn}
            onChange={async (next) => {
              setS({ ...s, manual_bank_enabled: next ? "1" : "0" });
              await save("manual_bank_enabled", next ? "1" : "0");
            }}
            tone={bankOn ? "emerald" : "default"}
            label="Aktifkan/nonaktifkan transfer bank manual"
          />
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-[var(--color-ink-2)] leading-relaxed">
            Saat aktif, opsi <strong>Transfer Bank</strong> tampil di halaman checkout. User
            transfer manual ke rekening di bawah, lalu admin verifikasi bukti dari halaman Order.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nama bank" icon={Building2}>
              <input
                className="input !pl-9"
                value={s.manual_bank_name ?? ""}
                onChange={(e) => setS({ ...s, manual_bank_name: e.target.value })}
                placeholder="contoh: BCA"
              />
            </Field>
            <Field label="Pemilik rekening" icon={UserIcon}>
              <input
                className="input !pl-9"
                value={s.manual_bank_holder ?? ""}
                onChange={(e) => setS({ ...s, manual_bank_holder: e.target.value })}
                placeholder="Nama sesuai buku tabungan"
              />
            </Field>
            <Field label="Nomor rekening" icon={CreditCard}>
              <input
                className="input !pl-9 font-mono tracking-wider"
                value={s.manual_bank_account ?? ""}
                onChange={(e) => setS({ ...s, manual_bank_account: e.target.value })}
                placeholder="1234567890"
              />
            </Field>
            <div className="sm:col-span-2">
              <label className="label inline-flex items-center gap-1.5" htmlFor="set-bank-note">
                <StickyNote size={14} /> Catatan transfer (opsional)
              </label>
              <textarea
                id="set-bank-note"
                className="textarea"
                value={s.manual_bank_note ?? ""}
                maxLength={1000}
                onChange={(e) => setS({ ...s, manual_bank_note: e.target.value })}
                placeholder="Akan ditampilkan ke user di halaman pembayaran."
              />
            </div>
          </div>
          <Button
            icon={Save}
            loading={savingKey?.startsWith("manual_bank_") ?? false}
            onClick={async () => {
              setSavingKey("manual_bank_name");
              try {
                await api("/admin/settings/upsert", {
                  body: { key: "manual_bank_name", value: s.manual_bank_name ?? "" },
                });
                await api("/admin/settings/upsert", {
                  body: { key: "manual_bank_account", value: s.manual_bank_account ?? "" },
                });
                await api("/admin/settings/upsert", {
                  body: { key: "manual_bank_holder", value: s.manual_bank_holder ?? "" },
                });
                await api("/admin/settings/upsert", {
                  body: { key: "manual_bank_note", value: s.manual_bank_note ?? "" },
                });
                toast.success("Rekening tersimpan.");
              } catch (e: any) {
                toast.error(e?.message ?? "Gagal simpan rekening.");
              } finally {
                setSavingKey(null);
              }
            }}
          >
            Simpan rekening
          </Button>
        </div>
      </section>

      {/* Audit log retention */}
      <section className="card p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="size-10 rounded-xl bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
            <ScrollText size={20} />
          </div>
          <div>
            <div className="font-extrabold text-[var(--color-ink)]">Retensi audit log</div>
            <div className="text-xs text-[var(--color-ink-2)]">
              Audit log lebih tua dari nilai ini akan dihapus otomatis oleh cron.
            </div>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="set-retention">Lama retensi (hari)</label>
          <input
            id="set-retention"
            className="input tabular-nums"
            type="number"
            min={30}
            max={365}
            value={s.audit_log_retention_days ?? "30"}
            onChange={(e) => setS({ ...s, audit_log_retention_days: e.target.value })}
          />
          <div className="help-text">
            Default 30 hari. Rentang yang diizinkan 30–365 hari. Audit log selalu dipangkas otomatis
            (tidak bisa dinonaktifkan). Cron menghapus paling banyak 1.000 baris per menit agar tidak
            membebani database.
          </div>
          <Button
            icon={Save}
            size="sm"
            className="mt-2"
            loading={savingKey === "audit_log_retention_days"}
            onClick={() => save("audit_log_retention_days", s.audit_log_retention_days ?? "30")}
          >
            Simpan retensi
          </Button>
        </div>
      </section>

      {/* Retensi chat (support & refund) */}
      <section className="card p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="size-10 rounded-xl bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
            <MessagesSquare size={20} />
          </div>
          <div>
            <div className="font-extrabold text-[var(--color-ink)]">Retensi chat</div>
            <div className="text-xs text-[var(--color-ink-2)]">
              Lama chat yang sudah ditutup dibiarkan sebelum dihapus total oleh sistem.
            </div>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="set-chat-retention">Hapus chat closed setelah</label>
          <select
            id="set-chat-retention"
            className="select-input"
            value={s.chat_retention_hours ?? "24"}
            onChange={(e) => setS({ ...s, chat_retention_hours: e.target.value })}
          >
            <option value="24">24 jam (1 hari)</option>
            <option value="48">48 jam (2 hari)</option>
            <option value="72">72 jam (3 hari)</option>
          </select>
          <div className="help-text">
            Berlaku untuk chat support umum maupun chat refund. Setelah ditutup admin dan melewati
            durasi ini, seluruh riwayat chat dihapus permanen di sisi user maupun admin.
          </div>
          <Button
            icon={Save}
            size="sm"
            className="mt-2"
            loading={savingKey === "chat_retention_hours"}
            onClick={() => save("chat_retention_hours", s.chat_retention_hours ?? "24")}
          >
            Simpan retensi chat
          </Button>
        </div>
      </section>
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

function Toggle({
  on,
  onChange,
  tone,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  tone: "amber" | "emerald" | "default";
  label?: string;
}) {
  const offCls = "bg-[var(--color-border-strong)]";
  const onCls = tone === "amber" ? "bg-amber-500" : tone === "emerald" ? "bg-emerald-500" : "bg-[var(--color-brand-500)]";
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative w-14 h-7 rounded-full transition shrink-0 ${on ? onCls : offCls}`}
      aria-pressed={on}
      aria-label={label ?? "Toggle"}
      title={label}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-[var(--color-surface)] shadow transition ${
          on ? "translate-x-7" : ""
        }`}
      />
    </button>
  );
}
