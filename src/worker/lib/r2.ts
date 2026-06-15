import type { AppBindings } from "../env";
import { log } from "./log";

/**
 * Util penghapusan objek R2 untuk mencegah file orphan (gambar produk, bukti
 * transfer) menumpuk dan memenuhi storage.
 *
 * URL yang disimpan di DB berbentuk `/api/files/<key>` (lihat routes/upload.ts).
 * Helper ini mengekstrak `<key>` dan menghapus objeknya dari R2. URL absolut
 * eksternal (http/https) di-skip — bukan milik bucket kita.
 */
export function fileKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/^\/api\/files\/(.+)$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * Hapus objek R2 untuk sekumpulan URL file (best-effort). Kegagalan dicatat
 * tapi tidak dilempar, supaya tidak menggagalkan operasi DB utama (hapus
 * produk/order). Orphan tersisa lebih baik daripada operasi yang gagal total.
 */
export async function deleteFileObjects(
  env: AppBindings,
  urls: (string | null | undefined)[],
): Promise<void> {
  const keys = Array.from(
    new Set(urls.map(fileKeyFromUrl).filter((k): k is string => !!k)),
  );
  if (keys.length === 0) return;
  try {
    await env.R2.delete(keys);
  } catch (err) {
    log.error({
      event: "r2.delete.failed",
      msg: "Gagal menghapus objek R2.",
      err,
      meta: { count: keys.length },
    });
  }
}
