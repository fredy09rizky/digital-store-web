/**
 * Rate limiter berbasis Durable Object.
 *
 * Tiap "key" rate-limit (mis. `rl:login:ip:1.2.3.4`) dipetakan ke satu instance
 * DO lewat `idFromName(key)`. Karena DO single-threaded dan konsisten secara
 * global, counter per-key bersifat atomik — tidak ada celah race seperti pola
 * read-modify-write di KV (yang eventually-consistent & bisa lolos saat request
 * datang bersamaan).
 *
 * Counter disimpan in-memory: DO tetap hidup selama key-nya aktif diakses,
 * sehingga akurat persis saat sedang terjadi brute-force. Bila key menganggur
 * lama dan DO di-evict, window memang sudah lewat — jadi reset tidak masalah.
 *
 * Parameter window & max dikirim per-request (query `w` & `m`) supaya satu kelas
 * melayani semua area rate-limit dengan jendela berbeda (4s, 60s, 300s, dst).
 */
export class RateLimiterDO {
  private windowStart = 0;
  private count = 0;

  constructor(_state: DurableObjectState, _env: unknown) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const windowSeconds = Math.max(1, parseInt(url.searchParams.get("w") || "60", 10) || 60);
    const max = Math.max(1, parseInt(url.searchParams.get("m") || "1", 10) || 1);
    const nowSec = Math.floor(Date.now() / 1000);

    if (this.windowStart === 0 || nowSec - this.windowStart >= windowSeconds) {
      this.windowStart = nowSec;
      this.count = 0;
    }

    let allowed: boolean;
    if (this.count >= max) {
      allowed = false;
    } else {
      this.count += 1;
      allowed = true;
    }

    return Response.json({
      allowed,
      remaining: Math.max(0, max - this.count),
      resetIn: windowSeconds - (nowSec - this.windowStart),
    });
  }
}
