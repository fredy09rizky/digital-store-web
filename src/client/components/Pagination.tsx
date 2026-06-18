import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Komponen pagination ringan untuk daftar admin.
 *
 * Pakai offset+page sederhana, sesuai pola admin list yang berukuran sedang
 * (kebanyakan < beberapa ribu baris). Untuk dataset > 100k baris, sebaiknya
 * upgrade ke cursor-based.
 */
interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Saat true, tombol nav dinonaktifkan (mis. saat loading). */
  disabled?: boolean;
}

export function Pagination({ page, pageSize, total, onPageChange, disabled }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const canPrev = page > 1 && !disabled;
  const canNext = page < totalPages && !disabled;
  return (
    <div
      className="flex items-center justify-between text-xs text-[var(--color-ink-2)] px-1 pt-3"
      aria-live="polite"
    >
      <div>
        {from.toLocaleString("id-ID")}–{to.toLocaleString("id-ID")} dari{" "}
        <span className="text-[var(--color-ink)] font-semibold">{total.toLocaleString("id-ID")}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          className="btn-icon disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="px-3 font-semibold text-[var(--color-ink)]">
          {page} <span className="text-[var(--color-ink-3)] font-normal">/ {totalPages}</span>
        </span>
        <button
          className="btn-icon disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
          aria-label="Halaman berikutnya"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
