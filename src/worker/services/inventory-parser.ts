// Parser fleksibel untuk teks stok yang dipaste/diupload admin.
// Aturan:
//  - Satu baris = satu item akun.
//  - Pemisah utama: "|".
//  - Field yang dikenal (urut posisi): email | password | note | expiry | extras...
//  - Email & password wajib ada, lainnya opsional.
//  - Boleh ada field tambahan; semua field setelah expiry digabung kembali jadi extras.
//  - Whitespace di tiap field di-trim.
//  - Baris kosong dan baris yang dimulai "#" diabaikan sebagai komentar.

export interface ParsedInventoryItem {
  email: string;
  password: string;
  note?: string;
  expiry?: string;
  extra?: string;
}

export interface InventoryParseResult {
  ok: boolean;
  items: ParsedInventoryItem[];
  errors: { line: number; message: string }[];
}

const SEP = "|";

export function parseInventoryText(text: string): InventoryParseResult {
  const items: ParsedInventoryItem[] = [];
  const errors: { line: number; message: string }[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const line = rawLine.trim();
    if (!line) return;
    if (line.startsWith("#")) return;
    // toleran terhadap spasi sebelum/sesudah pemisah
    const parts = line.split(SEP).map((p) => p.trim());
    if (parts.length < 2) {
      errors.push({
        line: lineNo,
        message: "Minimal harus ada email|password (gunakan tanda | sebagai pemisah).",
      });
      return;
    }
    const [email, password, note, expiry, ...rest] = parts;
    if (!email || !password) {
      errors.push({ line: lineNo, message: "Email dan password tidak boleh kosong." });
      return;
    }
    // Validasi longgar (tidak harus alamat email valid; bisa username/akun).
    if (email.length < 3) {
      errors.push({ line: lineNo, message: "Email/akun terlalu pendek." });
      return;
    }
    items.push({
      email,
      password,
      note: note || undefined,
      expiry: expiry || undefined,
      extra: rest.length ? rest.join(SEP) : undefined,
    });
  });

  return { ok: errors.length === 0, items, errors };
}
