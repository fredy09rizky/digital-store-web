import { useId } from "react";
import type { ComponentType, ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./Button";
import { useBackdropClose, useFocusTrap, useModalEffects } from "../lib/hooks";

type IconTone = "brand" | "danger" | "warning";
type Size = "sm" | "md" | "lg" | "xl";

const SIZE_CLS: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-xl",
  xl: "max-w-3xl",
};

const ICON_WRAP: Record<IconTone, string> = {
  brand: "bg-[var(--color-surface-tint)] text-[var(--color-brand-700)]",
  danger: "bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]",
  warning: "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-warning)]",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Judul opsional. Bila diisi, header standar (ikon + judul + tombol tutup) dirender. */
  title?: ReactNode;
  description?: ReactNode;
  icon?: ComponentType<{ size?: number; className?: string }>;
  iconTone?: IconTone;
  /** Lebar maksimum panel. Default `md`. */
  size?: Size;
  /** true → panel di-align ke atas & overlay scrollable (untuk form panjang). */
  scrollable?: boolean;
  /**
   * false → ESC & klik backdrop tidak menutup modal (mis. saat aksi async
   * sedang berjalan, atau modal wajib direspons). Default true.
   */
  closeOnBackdrop?: boolean;
  /** Render panel sebagai `<form>` dan teruskan `onSubmit`. Default `div`. */
  as?: "div" | "form";
  onSubmit?: (e: React.FormEvent) => void;
  /** Sembunyikan tombol tutup (X) di header. */
  hideClose?: boolean;
  /** Nama aksesibel saat tidak ada `title` (mis. modal dengan layout custom). */
  ariaLabel?: string;
  /** Kelas z-index overlay. Default `z-[80]`. */
  overlayZ?: string;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Primitif modal terpusat untuk seluruh aplikasi. Menyatukan scaffolding yang
 * sebelumnya diduplikasi di banyak dialog, sekaligus menjamin aksesibilitas
 * konsisten:
 *
 *   - `role="dialog"` + `aria-modal` + `aria-labelledby`/`aria-label`.
 *   - Focus trap (Tab/Shift+Tab tidak lolos ke belakang) via `useFocusTrap`.
 *   - Scroll-lock body, ESC untuk menutup, dan restore-focus via
 *     `useModalEffects`.
 *   - Klik backdrop menutup (kecuali `closeOnBackdrop=false`).
 *
 * Header standar opsional (lewat `title`); konten bebas via `children`, dan
 * footer aksi via `footer`. Untuk modal berbasis form, set `as="form"` +
 * `onSubmit`.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  iconTone = "brand",
  size = "md",
  scrollable = false,
  closeOnBackdrop = true,
  as = "div",
  onSubmit,
  hideClose = false,
  ariaLabel,
  overlayZ = "z-[80]",
  footer,
  children,
}: ModalProps) {
  const titleId = useId();
  const trapRef = useFocusTrap<HTMLElement>(open);
  useModalEffects(open, () => {
    if (closeOnBackdrop) onClose();
  });
  const onBackdropClick = useBackdropClose(() => {
    if (closeOnBackdrop) onClose();
  });

  if (!open) return null;

  const Panel = as === "form" ? "form" : "div";

  return (
    <div
      className={
        "fixed inset-0 bg-black/50 p-4 animate-fade-in " +
        overlayZ +
        " " +
        (scrollable ? "grid place-items-start overflow-y-auto" : "grid place-items-center")
      }
      onMouseDown={onBackdropClick}
    >
      <Panel
        ref={trapRef as React.Ref<HTMLDivElement> & React.Ref<HTMLFormElement>}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        tabIndex={-1}
        className={
          "card w-full p-5 sm:p-6 animate-scale-in outline-none " +
          SIZE_CLS[size] +
          " " +
          (scrollable
            ? "my-4 mx-auto"
            : "my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto")
        }
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        {title && (
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              {Icon && (
                <div className={"size-10 rounded-xl grid place-items-center shrink-0 " + ICON_WRAP[iconTone]}>
                  <Icon size={20} />
                </div>
              )}
              <div>
                <div
                  id={titleId}
                  className="font-extrabold text-base sm:text-lg text-[var(--color-ink)] leading-tight"
                >
                  {title}
                </div>
                {description && (
                  <div className="text-xs text-[var(--color-ink-2)] mt-1 leading-relaxed">
                    {description}
                  </div>
                )}
              </div>
            </div>
            {!hideClose && <IconButton type="button" icon={X} label="Tutup" onClick={onClose} />}
          </div>
        )}
        {children}
        {footer && <div className="flex justify-end gap-2 mt-5">{footer}</div>}
      </Panel>
    </div>
  );
}
