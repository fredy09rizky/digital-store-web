import { useState } from "react";
import type { ComponentType } from "react";
import { Package } from "lucide-react";

interface Props {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  /** Ikon fallback saat src kosong atau gagal load. Default: Package. */
  fallbackIcon?: ComponentType<{ size?: number; className?: string }>;
  fallbackSize?: number;
  /** Tambahan kelas khusus untuk wrapper fallback. */
  fallbackClassName?: string;
  /** Default eager untuk hero/important, lazy untuk grid. */
  loading?: "eager" | "lazy";
}

/**
 * Thumbnail produk yang aman dari URL rusak / 404. Saat src kosong atau
 * gagal load, otomatis menampilkan fallback ikon agar UI tidak menampilkan
 * kotak "broken image" bawaan browser.
 */
export function Thumbnail({
  src,
  alt = "",
  className = "",
  fallbackIcon: Icon = Package,
  fallbackSize = 24,
  fallbackClassName = "",
  loading = "lazy",
}: Props) {
  const [errored, setErrored] = useState(false);
  const showImg = !!src && !errored;
  return (
    <div className={"size-full grid place-items-center bg-[var(--color-surface-tint)] " + fallbackClassName}>
      {showImg ? (
        <img
          src={src as string}
          alt={alt}
          loading={loading}
          decoding="async"
          className={"size-full object-cover " + className}
          onError={() => setErrored(true)}
        />
      ) : (
        <Icon size={fallbackSize} className="text-[var(--color-brand-300)]" />
      )}
    </div>
  );
}
