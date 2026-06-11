export interface AppBindings {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  ASSETS: Fetcher;

  APP_NAME: string;
  APP_ENV: string;
  SESSION_TTL_SECONDS: string;
  ADMIN_OTP_TTL_SECONDS: string;
  ADMIN_OTP_RESEND_COOLDOWN: string;
  ADMIN_OTP_MAX_RESENDS: string;
  PAYMENT_EXPIRY_SECONDS: string;

  SESSION_SECRET: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD_HASH?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  PAKASIR_API_KEY?: string;
  PAKASIR_PROJECT?: string;
}

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  sessionId: string;
  sessionVersion: number;
  balanceCents: number;
};

export type AuthAdmin = {
  id: string;
  username: string;
  sessionId: string;
};

export interface AppContext {
  Bindings: AppBindings;
  Variables: {
    requestId: string;
    user: AuthUser | null;
    admin: AuthAdmin | null;
    ip: string;
    userAgent: string;
  };
}

export function envInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}
