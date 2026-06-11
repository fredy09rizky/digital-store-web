import { useEffect, useRef, useState } from "react";
import { ShieldAlert, X, ShieldCheck } from "lucide-react";
import { Button, IconButton } from "../../components/Button";
import { useBackdropClose, useModalEffects } from "../../lib/hooks";

interface Field {
  name: string;
  label: string;
  type?: "text" | "password" | "number" | "textarea";
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
}

interface AdminConfirmProps {
  open: boolean;
  title: string;
  description?: string;
  fields: Field[];
  /** Selalu tambahkan password admin sebagai field terakhir. */
  requirePassword?: boolean;
  confirmLabel?: string;
  destructive?: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
}

/**
 * Dialog konfirmasi multi-field untuk aksi sensitif admin.
 *
 *   - Mendukung password input dengan masking.
 *   - Mendukung kolom alasan (textarea).
 *   - Konsisten light theme itemku, tidak pakai window.prompt().
 */
export function AdminConfirm(props: AdminConfirmProps) {
  const allFields: Field[] = props.requirePassword
    ? [
        ...props.fields,
        {
          name: "__password",
          label: "Konfirmasi password admin",
          type: "password",
          required: true,
        },
      ]
    : props.fields;

  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useModalEffects(props.open, () => {
    if (!busy) props.onClose();
  });
  const onBackdropClick = useBackdropClose(() => {
    if (!busy) props.onClose();
  });

  useEffect(() => {
    if (!props.open) return;
    const initial: Record<string, string> = {};
    for (const f of allFields) initial[f.name] = f.defaultValue ?? "";
    setValues(initial);
    setBusy(false);
    setTimeout(() => firstInputRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  if (!props.open) return null;

  const missingRequired = allFields.some((f) => (f.required ?? true) && !values[f.name]?.trim());

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (missingRequired || busy) return;
    setBusy(true);
    try {
      await props.onSubmit(values);
    } finally {
      setBusy(false);
    }
  }

  const Icon = props.destructive ? ShieldAlert : ShieldCheck;

  return (
    <div
      className="fixed inset-0 bg-black/50 grid place-items-center z-[80] p-4 animate-fade-in"
      onMouseDown={onBackdropClick}
    >
      <form
        className="card max-w-md w-full p-5 sm:p-6 my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto animate-scale-in"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={
                "size-10 rounded-xl grid place-items-center " +
                (props.destructive
                  ? "bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]"
                  : "bg-[var(--color-surface-tint)] text-[var(--color-brand-700)]")
              }
            >
              <Icon size={20} />
            </div>
            <div>
              <div className="font-extrabold text-base text-[var(--color-ink)] leading-tight">
                {props.title}
              </div>
              {props.description && (
                <div className="text-xs text-[var(--color-ink-2)] mt-1 leading-relaxed">
                  {props.description}
                </div>
              )}
            </div>
          </div>
          <IconButton icon={X} label="Tutup" onClick={props.onClose} />
        </div>

        <div className="space-y-3 mt-4">
          {allFields.map((f, idx) => (
            <div key={f.name}>
              <label className="label" htmlFor={`acf-${f.name}`}>{f.label}</label>
              {f.type === "textarea" ? (
                <textarea
                  ref={idx === 0 ? (firstInputRef as React.RefObject<HTMLTextAreaElement>) : undefined}
                  id={`acf-${f.name}`}
                  className="textarea"
                  value={values[f.name] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  required={f.required ?? true}
                />
              ) : (
                <input
                  ref={idx === 0 ? (firstInputRef as React.RefObject<HTMLInputElement>) : undefined}
                  id={`acf-${f.name}`}
                  className="input"
                  type={f.type ?? "text"}
                  value={values[f.name] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  required={f.required ?? true}
                  autoComplete={f.type === "password" ? "current-password" : "off"}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button type="button" variant="ghost" onClick={props.onClose} disabled={busy}>
            Batal
          </Button>
          <Button
            type="submit"
            variant={props.destructive ? "danger" : "primary"}
            loading={busy}
            disabled={missingRequired}
          >
            {props.confirmLabel ?? "Konfirmasi"}
          </Button>
        </div>
      </form>
    </div>
  );
}
