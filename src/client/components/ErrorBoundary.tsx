import { Component, type ReactNode } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

/**
 * Error boundary global.
 *
 * Masalah utama yang ditangani: setelah deploy baru, nama file chunk lazy
 * (mis. `LoginPage-<hash>.js`) berubah. Tab lama yang masih merujuk hash lama
 * akan gagal `import()` saat navigasi ke rute lazy (chunk 404) — tanpa boundary,
 * seluruh app blank putih. Ini sering terlihat saat sesi habis (tab dibiarkan
 * lama melewati deploy) lalu user menekan "Login ulang".
 *
 * Strategi:
 *   - Deteksi error kegagalan muat modul dinamis → reload otomatis SEKALI untuk
 *     mengambil bundle terbaru (guard via sessionStorage agar tidak loop).
 *   - Error lain → tampilkan fallback ramah + tombol muat ulang.
 */

const CHUNK_ERR_RE =
  /(dynamically imported module|importing a module script failed|loading chunk|chunkloaderror|failed to fetch dynamically imported module)/i;

const RELOAD_KEY = "app_chunk_reload_ts";
const RELOAD_DEBOUNCE_MS = 10_000;

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");
  return CHUNK_ERR_RE.test(msg);
}

/**
 * Reload satu kali untuk memuat bundle terbaru. Dibatasi debounce agar tidak
 * terjadi loop reload bila chunk benar-benar hilang permanen. Mengembalikan
 * true bila reload dipicu.
 */
export function reloadForStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
    if (Date.now() - last > RELOAD_DEBOUNCE_MS) {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      window.location.reload();
      return true;
    }
  } catch {
    // sessionStorage bisa tidak tersedia (private mode ketat). Abaikan.
  }
  return false;
}

interface State {
  hasError: boolean;
  chunk: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, chunk: false };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, chunk: isChunkLoadError(err) };
  }

  componentDidCatch(err: unknown) {
    if (isChunkLoadError(err)) {
      // App kemungkinan ter-update (deploy baru). Coba reload sekali untuk
      // mengambil chunk versi terbaru.
      reloadForStaleChunk();
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    // Error chunk: sedang/akan reload otomatis. Tampilkan indikator ringkas +
    // tombol manual sebagai cadangan bila reload otomatis di-debounce.
    if (this.state.chunk) {
      return (
        <Centered
          icon={<RefreshCw size={24} className="animate-spin" />}
          title="Memperbarui aplikasi…"
          desc="Versi baru tersedia. Halaman sedang dimuat ulang otomatis."
          actionLabel="Muat ulang sekarang"
          onAction={() => window.location.reload()}
        />
      );
    }

    return (
      <Centered
        icon={<AlertTriangle size={24} />}
        title="Terjadi kesalahan tak terduga"
        desc="Maaf, ada yang tidak beres saat menampilkan halaman ini. Coba muat ulang."
        actionLabel="Muat ulang"
        onAction={() => window.location.reload()}
        showHome
      />
    );
  }
}

function Centered({
  icon,
  title,
  desc,
  actionLabel,
  onAction,
  showHome,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  actionLabel: string;
  onAction: () => void;
  showHome?: boolean;
}) {
  return (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto size-12 rounded-xl bg-[var(--color-surface-tint)] text-[var(--color-brand-700)] grid place-items-center mb-3">
          {icon}
        </div>
        <div className="font-extrabold text-lg text-[var(--color-ink)]" style={{ fontFamily: "var(--font-display)" }}>
          {title}
        </div>
        <p className="text-sm text-[var(--color-ink-2)] mt-1.5 leading-relaxed">{desc}</p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <button type="button" onClick={onAction} className="btn-primary">
            <RefreshCw size={16} /> {actionLabel}
          </button>
          {showHome && (
            <a href="/" className="btn-outline">
              Beranda
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
