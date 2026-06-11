import type { AppBindings } from "../env";

/**
 * Sliding-ish token bucket sederhana berbasis KV.
 * Cukup untuk anti brute force pada endpoint sensitif (login, OTP).
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

interface Counter {
  start: number;
  count: number;
}

export async function rateLimit(bindings: AppBindings, opts: RateLimitOpts): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const raw = await bindings.KV.get(opts.key);
  let counter: Counter | null = null;
  if (raw) {
    try {
      counter = JSON.parse(raw) as Counter;
    } catch {
      counter = null;
    }
  }
  if (!counter || now - counter.start >= opts.windowSeconds) {
    counter = { start: now, count: 0 };
  }
  if (counter.count >= opts.max) {
    return { allowed: false, remaining: 0, resetIn: opts.windowSeconds - (now - counter.start) };
  }
  counter.count += 1;
  // KV minimum TTL = 60s
  const ttl = Math.max(60, opts.windowSeconds);
  await bindings.KV.put(opts.key, JSON.stringify(counter), {
    expirationTtl: ttl,
  });
  return { allowed: true, remaining: opts.max - counter.count, resetIn: opts.windowSeconds - (now - counter.start) };
}
