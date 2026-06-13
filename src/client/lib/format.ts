export function rupiah(cents: number): string {
  return `Rp${(cents ?? 0).toLocaleString("id-ID")}`;
}

export function dateID(unix: number, opts?: Intl.DateTimeFormatOptions): string {
  if (!unix) return "-";
  const d = new Date(unix * 1000);
  // Selalu format dalam zona Asia/Jakarta (WIB, GMT+7). Server menyimpan epoch
  // UTC, jadi tampilan konsisten untuk semua user lepas dari zona browser.
  const merged: Intl.DateTimeFormatOptions = {
    ...(opts ?? { dateStyle: "medium", timeStyle: "short" }),
    timeZone: "Asia/Jakarta",
  };
  const out = d.toLocaleString("id-ID", merged);
  // Tambahkan label WIB hanya bila output memuat komponen jam.
  const hasTime =
    merged.timeStyle != null || merged.hour != null || merged.minute != null;
  return hasTime ? `${out} WIB` : out;
}

export function relativeID(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} hari lalu`;
  return dateID(unix, { dateStyle: "medium" });
}

export function countdown(secondsLeft: number): string {
  const m = Math.max(0, Math.floor(secondsLeft / 60));
  const s = Math.max(0, Math.floor(secondsLeft % 60));
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
