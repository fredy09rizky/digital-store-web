import type { MiddlewareHandler } from "hono";
import type { AppContext } from "../env";
import { fail } from "../lib/response";

export const blockOnMaintenance: MiddlewareHandler<AppContext> = async (c, next) => {
  const row = await c.env.DB.prepare("SELECT value FROM app_settings WHERE key = 'maintenance_mode'").first<{
    value: string;
  }>();
  const active = row?.value === "1";
  if (active) {
    return fail(
      c,
      "maintenance",
      "Checkout sedang dalam pemeliharaan. Silakan coba beberapa saat lagi.",
      503,
    );
  }
  await next();
};
