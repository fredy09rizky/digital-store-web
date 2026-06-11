// ID generator yang aman untuk Workers (tanpa Node crypto.randomUUID).
const ALPH = "0123456789abcdefghijklmnopqrstuvwxyz";

export function nanoId(prefix?: string, length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPH[bytes[i] % ALPH.length];
  }
  return prefix ? `${prefix}_${out}` : out;
}

export function shortCode(length = 8): string {
  // Hindari 0/O/1/I supaya enak dibaca user.
  const alpha = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alpha[bytes[i] % alpha.length];
  }
  return out;
}

export function orderCode(): string {
  // contoh: ORD-7HQXK4GA
  return `ORD-${shortCode(8)}`;
}

export function skuFromName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `${base || "prd"}-${shortCode(5).toLowerCase()}`;
}
