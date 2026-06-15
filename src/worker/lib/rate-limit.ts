import type { AppBindings } from "../env";
import { log } from "./log";

/**
 * Rate limit atomik & global lewat Durable Object (lihat rate-limiter-do.ts).
 * Interface dipertahankan sama persis dengan versi KV sebelumnya supaya semua
 * pemanggil (login, OTP, register, upload, cek-status, dll) tidak perlu diubah.
 */
export interface RateLimitOpts {
  key: string;
  windowSeconds: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
}

export async function rateLimit(bindings: AppBindings, opts: RateLimitOpts): Promise<RateLimitResult> {
  try {
    const id = bindings.RATE_LIMITER.idFromName(opts.key);
    const stub = bindings.RATE_LIMITER.get(id);
    const url = `https://rate-limiter/?w=${opts.windowSeconds}&m=${opts.max}`;
    const res = await stub.fetch(url);
    return await res.json<RateLimitResult>();
  } catch (err) {
    // Fail-open bila DO bermasalah: lebih baik melewatkan rate-limit sesaat
    // daripada memblokir total layanan (mis. semua user gagal login). Kejadian
    // ini sangat jarang dan dicatat untuk investigasi.
    log.error({ event: "ratelimit.do_unavailable", msg: "Rate limiter DO tidak tersedia.", err });
    return { allowed: true, remaining: opts.max, resetIn: opts.windowSeconds };
  }
}
