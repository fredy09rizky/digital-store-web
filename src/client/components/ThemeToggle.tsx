import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/theme";

/**
 * Tombol toggle tema light/dark. Aksesibel (aria-label dinamis) dan
 * memberi microinteraction rotasi ikon halus.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { isDark, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Beralih ke mode terang" : "Beralih ke mode gelap"}
      title={isDark ? "Mode terang" : "Mode gelap"}
      className={
        "relative inline-grid place-items-center size-9 rounded-full border border-[var(--color-border)] " +
        "text-[var(--color-ink-2)] hover:text-[var(--color-brand-700)] hover:border-[var(--color-brand-300)] " +
        "transition-colors focus-visible:ring-focus " +
        className
      }
    >
      <Sun
        size={17}
        className={
          "absolute transition-all duration-300 " +
          (isDark ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100")
        }
      />
      <Moon
        size={17}
        className={
          "absolute transition-all duration-300 " +
          (isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50")
        }
      />
    </button>
  );
}
