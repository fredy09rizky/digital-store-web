export const now = () => Math.floor(Date.now() / 1000);
export const nowMs = () => Date.now();

/**
 * Format epoch detik (UTC) ke string waktu WIB (Asia/Jakarta).
 *
 * WIB = UTC+7 tetap (Indonesia tidak menerapkan DST), jadi cukup digeser +7 jam
 * lalu dibaca dengan getter UTC. Tanpa ketergantungan Intl/ICU. Output:
 * `YYYY-MM-DD HH:mm:ss WIB`. Mengembalikan "" untuk nilai kosong.
 */
export function formatWIB(unix: number | null | undefined): string {
  if (!unix) return "";
  const d = new Date((unix + 7 * 3600) * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} WIB`;
}
