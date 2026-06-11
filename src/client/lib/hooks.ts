import { useCallback, useEffect, useRef } from "react";
/**
 * Efek standar untuk modal/overlay:
 *
 *   - Lock body scroll saat overlay terbuka (mencegah halaman ikut scroll
 *     di belakang modal saat user scroll dengan touch / wheel).
 *   - Tutup otomatis saat user menekan Escape.
 *   - Restore focus ke elemen yang tadi aktif sebelum modal dibuka, supaya
 *     keyboard user tidak "hilang" setelah modal ditutup.
 *
 * Dipakai oleh ConfirmDialog, AdminConfirm, dan modal-modal lain yang
 * berbasis div fixed inset-0.
 */
export function useModalEffects(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    }
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        // Defer agar tidak bertabrakan dengan unmount
        setTimeout(() => previouslyFocused.focus({ preventScroll: true }), 0);
      }
    };
  }, [open]);
}

/**
 * Helper kecil untuk kasus di mana kita ingin menutup overlay dengan
 * mengklik backdrop, tapi click di dalam panel tidak boleh men-trigger
 * close. Mengembalikan handler `onMouseDown` yang aman dari false-positive
 * akibat drag select text.
 */
export function useBackdropClose(onClose: () => void) {
  return useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Hanya tutup kalau target adalah backdrop itu sendiri (currentTarget),
      // bukan elemen di dalamnya.
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );
}


/**
 * Memberi efek "shake" pada sebuah elemen (mis. kartu form) untuk menarik
 * perhatian saat terjadi error. Mengembalikan `ref` untuk ditempel ke elemen
 * dan `shake()` untuk memicu animasi. Trik remove → reflow → add memastikan
 * animasi bisa dipicu berulang kali meski class-nya sudah ada.
 */
export function useShake<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const shake = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove("animate-shake");
    // Paksa reflow agar animasi bisa di-restart.
    void el.offsetWidth;
    el.classList.add("animate-shake");
  }, []);
  return { ref, shake };
}
