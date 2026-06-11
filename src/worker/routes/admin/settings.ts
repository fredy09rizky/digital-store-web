import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/response";
import { now } from "../../lib/time";
import { audit } from "../../lib/audit";

const app = new Hono<AppContext>({ strict: false });

app.get("/", async (c) => {
  const rs = await c.env.DB.prepare("SELECT key, value FROM app_settings").all<{ key: string; value: string }>();
  const obj: Record<string, string> = {};
  for (const r of rs.results ?? []) obj[r.key] = r.value;
  return ok(c, obj);
});

const Body = z.object({
  key: z.string().min(1).max(64),
  value: z.string().max(1000),
});

// Validator khusus untuk key yang punya makna spesifik. Endpoint settings
// bersifat generik (key/value), jadi tanpa penjaga ini nilai non-numerik bisa
// merusak perhitungan checkout atau cron (mis. service_fee_cents='abc').
const BOOL_KEYS = new Set(["maintenance_mode", "manual_bank_enabled"]);
const INT_KEYS: Record<string, { min: number; max: number; label: string }> = {
  service_fee_cents: { min: 0, max: 100_000_000, label: "Biaya layanan" },
  audit_log_retention_days: { min: 0, max: 3650, label: "Retensi audit log" },
  max_wallet_balance_cents: { min: 0, max: 1_000_000_000, label: "Batas saldo maksimal" },
};

function validateSetting(key: string, value: string): string | null {
  if (BOOL_KEYS.has(key)) {
    if (value !== "0" && value !== "1") return "Nilai harus 0 atau 1.";
    return null;
  }
  const intRule = INT_KEYS[key];
  if (intRule) {
    if (!/^\d+$/.test(value)) return `${intRule.label} harus berupa angka bulat tidak negatif.`;
    const n = parseInt(value, 10);
    if (n < intRule.min || n > intRule.max)
      return `${intRule.label} harus antara ${intRule.min} dan ${intRule.max}.`;
    return null;
  }
  return null;
}

app.post("/upsert", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Form tidak valid.");
  const keyErr = validateSetting(parsed.data.key, parsed.data.value);
  if (keyErr) return fail(c, "validation", keyErr);
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
  )
    .bind(parsed.data.key, parsed.data.value, ts)
    .run();
  await audit(c.env, {
    actorKind: "admin",
    actorId: c.get("admin")!.id,
    action: "admin.settings.update",
    meta: { key: parsed.data.key },
  });
  return ok(c, { ok: true });
});

export default app;
