import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";

type ToastKind = "info" | "success" | "error" | "warn";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  push: (kind: ToastKind, message: string) => void;
  info: (m: string) => void;
  success: (m: string) => void;
  error: (m: string) => void;
  warn: (m: string) => void;
}

const ToastsContext = createContext<{
  items: ToastItem[];
  push: ToastApi["push"];
  dismiss: (id: number) => void;
} | null>(null);
const ToastApiContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const v = useContext(ToastApiContext);
  if (!v) throw new Error("Toast belum siap");
  return v;
}

export function useToastBus() {
  return { Provider: ToastBusProvider };
}

function ToastBusProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);
  const push = useCallback<ToastApi["push"]>(
    (kind, message) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setItems((prev) => [...prev, { id, kind, message }]);
      // Error/peringatan bertahan lebih lama supaya sempat terbaca.
      const timeout = kind === "error" ? 7000 : kind === "warn" ? 6000 : 4200;
      setTimeout(() => dismiss(id), timeout);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({
      push,
      info: (m) => push("info", m),
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      warn: (m) => push("warn", m),
    }),
    [push],
  );
  return (
    <ToastApiContext.Provider value={api}>
      <ToastsContext.Provider value={{ items, push, dismiss }}>{children}</ToastsContext.Provider>
    </ToastApiContext.Provider>
  );
}

const KIND_STYLE: Record<
  ToastKind,
  { border: string; icon: React.ComponentType<{ size?: number; className?: string }>; iconColor: string }
> = {
  success: { border: "var(--color-success)", icon: CheckCircle2, iconColor: "var(--color-success)" },
  error: { border: "var(--color-danger)", icon: AlertCircle, iconColor: "var(--color-danger)" },
  warn: { border: "var(--color-warning)", icon: AlertTriangle, iconColor: "var(--color-warning)" },
  info: { border: "var(--color-brand-500)", icon: Info, iconColor: "var(--color-brand-700)" },
};

export function ToastHost() {
  const ctx = useContext(ToastsContext);
  if (!ctx) return null;
  return (
    <div className="pointer-events-none fixed z-[100] top-3 inset-x-0 px-3 flex flex-col items-center gap-2 sm:top-4 sm:right-4 sm:left-auto sm:inset-x-auto sm:items-end sm:px-0">
      {ctx.items.map((t) => {
        const { border, icon: Icon, iconColor } = KIND_STYLE[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto max-w-md w-full sm:w-[360px] flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-[var(--shadow-elev)] animate-slide-down text-sm"
            style={{ borderLeft: `3px solid ${border}` }}
          >
            <span className="mt-0.5 shrink-0" style={{ color: iconColor }}>
              <Icon size={18} />
            </span>
            <div className="flex-1 text-[var(--color-ink)] text-[13px] leading-snug">{t.message}</div>
            <button
              onClick={() => ctx.dismiss(t.id)}
              aria-label="Tutup notifikasi"
              className="mt-0.5 text-[var(--color-ink-3)] hover:text-[var(--color-ink)] transition"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
