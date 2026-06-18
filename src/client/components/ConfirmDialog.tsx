import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "./Button";
import { Modal } from "./Modal";

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
 * Pengganti `window.confirm()` agar UX konsisten dengan tema dan agar bisa
 * kita tambahi tone (info/peringatan/destruktif), ikon kontekstual, dan
 * loading state saat aksi async sedang berjalan.
 *
 * Aksesibilitas (role dialog, focus trap, ESC, scroll-lock, restore focus)
 * ditangani oleh primitif `Modal`. Auto-focus diarahkan ke tombol konfirmasi.
 *
 * Untuk aksi sensitif yang butuh konfirmasi password admin, gunakan
 * `AdminConfirm` (di pages/admin/AdminConfirm.tsx).
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const tone = props.tone ?? "default";

  useEffect(() => {
    if (!props.open) return;
    setBusy(false);
    // Auto focus tombol konfirmasi supaya keyboard user bisa Enter dengan
    // tekanan minimal, sesuai pola alert browser yang dia gantikan.
    const t = setTimeout(() => confirmRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [props.open]);

  const Icon = props.icon ?? (tone === "default" ? Info : AlertTriangle);

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
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      icon={Icon}
      iconTone={tone === "default" ? "brand" : tone}
      size="sm"
      closeOnBackdrop={!busy}
      footer={
        <>
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
        </>
      }
    >
      {props.description && (
        <div className="text-sm text-[var(--color-ink-2)] leading-relaxed">
          {props.description}
        </div>
      )}
    </Modal>
  );
}
