/**
 * Penanganan error D1 yang bersifat transien (sementara).
 *
 * D1 sesekali melempar error seperti:
 *   - "D1_ERROR: D1 DB storage operation exceeded timeout which caused object
 *      to be reset."
 *   - "Network connection lost."
 *   - "Cannot resolve Durable Object due to transient issue ..."
 *
 * Ini bukan bug aplikasi: operasi memang tidak selesai karena hambatan sesaat
 * di infra. Pola yang direkomendasikan adalah mencoba ulang beberapa kali
 * dengan jeda singkat. Karena itu helper ini HANYA untuk operasi yang aman
 * diulang (baca, atau tulis idempoten/aman bila terjadi dua kali).
 */

const TRANSIENT_RE =
  /(storage operation exceeded timeout|object to be reset|network connection lost|connection (was )?reset|transient|reset because its code was updated|internal error in the durable object)/i;

export function isTransientD1Error(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return TRANSIENT_RE.test(msg);
}

/**
 * Jalankan operasi D1 dengan retry pada error transien. Default 2 retry
 * (total 3 percobaan) dengan backoff linear kecil. Error non-transien langsung
 * dilempar tanpa retry.
 */
export async function withD1Retry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 60;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isTransientD1Error(err)) {
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
