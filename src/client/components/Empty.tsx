import type { ComponentType, ReactNode } from "react";
import { PackageOpen } from "lucide-react";

interface Props {
  title: string;
  hint?: string;
  /** Ikon visual dari lucide-react. Default: PackageOpen. */
  icon?: ComponentType<{ size?: number; className?: string }>;
  action?: ReactNode;
}

export function Empty({ title, hint, icon, action }: Props) {
  const Icon = icon ?? PackageOpen;

  return (
    <div className="card p-8 sm:p-12 text-center">
      <div className="relative inline-flex items-center justify-center mb-4">
        <div className="absolute inset-0 rounded-full bg-[var(--color-brand-500)]/15 blur-xl" aria-hidden />
        <div className="relative inline-flex items-center justify-center size-16 rounded-2xl bg-[var(--color-surface-tint)] text-[var(--color-brand-700)] border border-[var(--color-border)]">
          <Icon size={28} />
        </div>
      </div>
      <div className="font-bold text-[var(--color-ink)] text-lg" style={{ fontFamily: "var(--font-display)" }}>
        {title}
      </div>
      {hint && (
        <div className="text-sm text-[var(--color-ink-2)] mt-2 max-w-sm mx-auto leading-relaxed">{hint}</div>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
