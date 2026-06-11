import { useCallback, useEffect, useState } from "react";

/**
 * Manajemen tema (light/dark) — CSP-safe (tidak ada inline script).
 *
 * Mode disimpan di localStorage:
 *   - "light" | "dark"  : override eksplisit user
 *   - "system" (default): ikut prefers-color-scheme
 *
 * `applyTheme()` dipanggil sekali di main.tsx sebelum render untuk meminimalkan
 * flash, lalu kapan pun mode berubah. Class `.dark` ditempel di <html>.
 */
export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "pp-theme";

export function getStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

export function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveDark(mode: ThemeMode): boolean {
  return mode === "dark" || (mode === "system" && systemPrefersDark());
}

export function applyTheme(mode: ThemeMode = getStoredMode()) {
  const dark = resolveDark(mode);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
}

export function setMode(mode: ThemeMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  applyTheme(mode);
  window.dispatchEvent(new CustomEvent("pp-theme-change"));
}

/**
 * Hook tema untuk komponen toggle. Mengembalikan mode tersimpan, apakah saat
 * ini gelap, dan helper untuk mengganti.
 */
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => getStoredMode());
  const [isDark, setIsDark] = useState<boolean>(() => resolveDark(getStoredMode()));

  useEffect(() => {
    const sync = () => {
      const m = getStoredMode();
      setModeState(m);
      setIsDark(resolveDark(m));
    };
    sync();
    window.addEventListener("pp-theme-change", sync);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMq = () => {
      if (getStoredMode() === "system") {
        applyTheme("system");
        sync();
      }
    };
    mq.addEventListener("change", onMq);
    return () => {
      window.removeEventListener("pp-theme-change", sync);
      mq.removeEventListener("change", onMq);
    };
  }, []);

  const toggle = useCallback(() => {
    setMode(resolveDark(getStoredMode()) ? "light" : "dark");
  }, []);

  const change = useCallback((m: ThemeMode) => setMode(m), []);

  return { mode, isDark, toggle, setMode: change };
}
