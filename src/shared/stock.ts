// ============================================================
//  Input stok "konten bebas" (tanpa parsing).
//  Dipakai bersama client (pratinjau real-time) & worker (sumber kebenaran),
//  sehingga jumlah & pemecahan item yang dilihat admin = persis yang disimpan.
// ============================================================

/** Maksimal karakter per satu item stok. */
export const STOCK_ITEM_MAX_CHARS = 2000;

/** Maksimal jumlah item stok per sekali submit (batas teknis aman, bukan kuota total). */
export const STOCK_BULK_MAX_ITEMS = 1000;

export type StockInputMode = "single" | "multiple";

/** Cara memisah antar-item di mode multiple. */
export type StockSeparator = "newline" | "blankline" | "custom";

export interface StockSplitResult {
  /** Item yang sudah dipecah & di-trim (urut). */
  items: string[];
  /** Indeks (1-based) item yang melebihi STOCK_ITEM_MAX_CHARS. */
  tooLong: number[];
}

/**
 * Pecah teks input menjadi daftar item stok. Tidak ada parsing isi — tiap item
 * disimpan apa adanya. Hanya memisah & trim.
 */
export function splitStockInput(
  text: string,
  mode: StockInputMode,
  separator: StockSeparator = "newline",
  customToken = "",
): StockSplitResult {
  const normalized = (text ?? "").replace(/\r\n?/g, "\n");
  let rawItems: string[];

  if (mode === "single") {
    const one = normalized.trim();
    rawItems = one ? [one] : [];
  } else if (separator === "newline") {
    // 1 baris = 1 item (cocok untuk kode/link/akun satu-baris).
    rawItems = normalized.split("\n");
  } else if (separator === "blankline") {
    // Item dipisah oleh satu atau lebih baris kosong.
    rawItems = normalized.split(/\n[ \t]*\n+/);
  } else {
    // Penanda khusus: baris yang isinya PERSIS sama dengan token (setelah trim).
    const token = customToken.trim();
    if (!token) {
      const one = normalized.trim();
      rawItems = one ? [one] : [];
    } else {
      const lines = normalized.split("\n");
      const blocks: string[] = [];
      let current: string[] = [];
      for (const line of lines) {
        if (line.trim() === token) {
          blocks.push(current.join("\n"));
          current = [];
        } else {
          current.push(line);
        }
      }
      blocks.push(current.join("\n"));
      rawItems = blocks;
    }
  }

  const items = rawItems.map((s) => s.trim()).filter((s) => s.length > 0);
  const tooLong: number[] = [];
  items.forEach((s, i) => {
    if (s.length > STOCK_ITEM_MAX_CHARS) tooLong.push(i + 1);
  });
  return { items, tooLong };
}
