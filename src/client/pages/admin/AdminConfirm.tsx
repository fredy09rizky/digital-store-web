import { useEffect, useRef, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";

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
 *   - Konsisten dengan tema; tidak pakai `window.prompt()`.
 *
 * Aksesibilitas (role dialog, focus trap, ESC, scroll-lock, restore focus)
 * ditangani oleh primitif `Modal`.
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

  useEffect(() => {
    if (!props.open) return;
    const initial: Record<string, string> = {};
    for (const f of allFields) initial[f.name] = f.defaultValue ?? "";
    setValues(initial);
    setBusy(false);
    const t = setTimeout(() => firstInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
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
    <Modal
      open={props.open}
      onClose={props.onClose}
      as="form"
      onSubmit={handleSubmit}
      title={props.title}
      description={props.description}
      icon={Icon}
      iconTone={props.destructive ? "danger" : "brand"}
      closeOnBackdrop={!busy}
      footer={
        <>
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
        </>
      }
    >
      <div className="space-y-3 mt-1">
        {allFields.map((f, idx) => (
          <div key={f.name}>
            <label className="label" htmlFor={`acf-${f.name}`}>
              {f.label}
            </label>
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
    </Modal>
  );
}
