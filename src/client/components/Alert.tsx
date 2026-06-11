import { useEffect, useRef } from "react";
import type { ComponentType, ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type AlertTone = "error" | "warn" | "success" | "info";

const TONE: Record<AlertTone, { color: string; bg: string; border: string; icon: ComponentType<{ size?: number; className?: string }> }> = {
  error: {
    color: "var(--color-danger)",
    bg: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
    border: "color-mix(in srgb, var(--color-danger) 38%, transparent)",
    icon: AlertCircle,
  },
  warn: {
    color: "var(--color-warning)",
    bg: "color-mix(in srgb, var(--color-warning) 14%, transparent)",
    border: "color-mix(in srgb, var(--color-warning) 38%, transparent)",
    icon: AlertTriangle,
  },
  success: {
    color: "var(--color-success)",
    bg: "color-mix(in srgb, var(--color-success) 14%, transparent)",
    border: "color-mix(in srgb, var(--color-success) 38%, transparent)",
    icon: CheckCircle2,
  },
  info: {
    color: "var(--color-brand-700)",
    bg: "var(--color-surface-tint)",
    border: "color-mix(in srgb, var(--color-brand-500) 30%, transparent)",
    icon: Info,
  },
};

interface Props {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  /** Tampilkan tombol tutup. */
  onClose?: () => void;
  /**
   * Saat true (default), alert akan di-scroll ke viewport dan menerima fokus
   * begitu muncul, supaya user (dan screen reader) langsung sadar. Matikan
   * untuk alert statis/informasi yang tidak butuh menarik fokus.
   */
  autoFocus?: boolean;
  className?: string;
}

/**
 * Banner notifikasi inline yang ditempel dekat konteksnya (mis. di atas form
 * login). Berbeda dari toast: Alert tidak menghilang sendiri dan tidak mudah
 * terlewat karena muncul tepat di area yang sedang dilihat user.
 *
 * - `role="alert"` (assertive) untuk error/warn agar diumumkan screen reader.
 * - `role="status"` untuk success/info.
 */
export function Alert({ tone = "error", title, children, onClose, autoFocus = true, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const t = TONE[tone];
  const Icon = t.icon;
  const assertive = tone === "error" || tone === "warn";

  useEffect(() => {
    if (!autoFocus) return;
    const el = ref.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    el.focus({ preventScroll: true });
  }, [autoFocus]);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      className={"flex items-start gap-2.5 rounded-xl border p-3 text-sm animate-slide-down outline-none " + className}
      style={{ color: t.color, backgroundColor: t.bg, borderColor: t.border }}
    >
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 leading-snug">
        {title && <div className="font-semibold">{title}</div>}
        <div className={title ? "text-[var(--color-ink-2)] mt-0.5" : ""}>{children}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup peringatan"
          className="mt-0.5 shrink-0 opacity-70 hover:opacity-100 transition"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
