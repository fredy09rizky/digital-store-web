import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { AlertTriangle, X, Info } from "lucide-react";
import { Button, IconButton } from "./Button";
import { useBackdropClose, useModalEffects } from "../lib/hooks";

export type ConfirmTone = "default" | "danger" | "warning";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  icon?: ComponentType<{ size?: number; className?: string }>;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

/**
 * Modal konfirmasi ringan, tidak butuh input apapun selain klik konfirmasi.
 * Pengganti `window.confirm()` agar UX konsisten dengan tema light theme
 * dan agar bisa kita tambahi tone (info/peringatan/destruktif), ikon
 * kontekstual, dan loading state saat aksi async sedang berjalan.
 *
 * Untuk aksi sensitif yang butuh konfirmasi password admin, gunakan
 * `AdminConfirm` (di pages/admin/AdminConfirm.tsx).
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const tone = props.tone ?? "default";

  // ESC, body scroll lock, dan focus restore.
  useModalEffects(props.open, props.onClose);
  const onBackdropClick = useBackdropClose(() => {
    if (!busy) props.onClose();
  });

  useEffect(() => {
    if (!props.open) return;
    setBusy(false);
    // Auto focus tombol konfirmasi supaya keyboard user bisa Enter dengan
    // tekanan minimal, sesuai pola alert browser yang dia gantikan.
    setTimeout(() => confirmRef.current?.focus(), 50);
  }, [props.open]);

  if (!props.open) return null;

  const Icon = props.icon ?? (tone === "default" ? Info : AlertTriangle);

  const iconWrap =
    tone === "danger"
      ? "bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]"
      : tone === "warning"
        ? "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-warning)]"
        : "bg-[var(--color-surface-tint)] text-[var(--color-brand-700)]";

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      await props.onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 grid place-items-center z-[80] p-4 animate-fade-in"
      onMouseDown={onBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="card max-w-sm w-full p-5 sm:p-6 my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto animate-scale-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`size-10 rounded-xl grid place-items-center ${iconWrap}`}>
              <Icon size={20} />
            </div>
            <div className="font-extrabold text-base text-[var(--color-ink)] leading-tight" id="confirm-dialog-title">
              {props.title}
            </div>
          </div>
          <IconButton icon={X} label="Tutup" onClick={props.onClose} />
        </div>

        {props.description && (
          <div className="text-sm text-[var(--color-ink-2)] leading-relaxed">
            {props.description}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <Button type="button" variant="ghost" onClick={props.onClose} disabled={busy}>
            {props.cancelLabel ?? "Batal"}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant={tone === "danger" ? "danger" : "primary"}
            loading={busy}
            onClick={handleConfirm}
          >
            {props.confirmLabel ?? "Konfirmasi"}
          </Button>
        </div>
      </div>
    </div>
  );
}
