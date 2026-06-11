import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/response";
import { now } from "../../lib/time";
import { nanoId } from "../../lib/id";
import { audit } from "../../lib/audit";
import { firstIssueMessage } from "../../lib/validation";

const app = new Hono<AppContext>({ strict: false });

app.get("/", async (c) => {
  const rs = await c.env.DB.prepare("SELECT * FROM vouchers ORDER BY created_at DESC LIMIT 200").all<any>();
  return ok(c, rs.results ?? []);
});

const Body = z
  .object({
    code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_-]+$/i),
    description: z.string().trim().max(300).optional().nullable(),
    discountType: z.enum(["percent", "amount"]),
    discountValue: z.coerce.number().int().min(1),
    maxDiscountCents: z.coerce.number().int().min(0).optional().nullable(),
    minSubtotalCents: z.coerce.number().int().min(0).default(0),
    scopeType: z.enum(["all", "category", "product"]).default("all"),
    scopeRefId: z.string().trim().optional().nullable(),
    totalQuota: z.coerce.number().int().min(0).optional().nullable(),
    perUserQuota: z.coerce.number().int().min(1).default(1),
    activeFrom: z.coerce.number().int().min(0),
    activeUntil: z.coerce.number().int().min(0),
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    // Diskon persen tidak masuk akal di atas 100%.
    if (data.discountType === "percent" && data.discountValue > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "Diskon persen maksimal 100%.",
      });
    }
    // Periode aktif harus valid.
    if (data.activeUntil <= data.activeFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["activeUntil"],
        message: "Tanggal 'aktif sampai' harus setelah 'aktif dari'.",
      });
    }
    // Scope spesifik wajib menyertakan referensi.
    if (data.scopeType !== "all" && !data.scopeRefId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scopeRefId"],
        message: "Scope kategori/produk wajib mengisi ID referensi.",
      });
    }
  });

app.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success)
    return fail(c, "validation", firstIssueMessage(parsed.error, "Form voucher tidak valid."), 400, parsed.error.flatten());
  const ts = now();
  const id = nanoId("vch");
  try {
    await c.env.DB.prepare(
      `INSERT INTO vouchers (id, code, description, discount_type, discount_value, max_discount_cents, min_subtotal_cents,
                             scope_type, scope_ref_id, total_quota, per_user_quota, active_from, active_until, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        parsed.data.code.toUpperCase(),
        parsed.data.description ?? null,
        parsed.data.discountType,
        parsed.data.discountValue,
        parsed.data.maxDiscountCents ?? null,
        parsed.data.minSubtotalCents,
        parsed.data.scopeType,
        parsed.data.scopeRefId ?? null,
        parsed.data.totalQuota ?? null,
        parsed.data.perUserQuota,
        parsed.data.activeFrom,
        parsed.data.activeUntil,
        parsed.data.isActive ? 1 : 0,
        ts,
        ts,
      )
      .run();
  } catch (e: any) {
    return fail(c, "duplicate", "Kode voucher sudah dipakai.");
  }
  await audit(c.env, {
    actorKind: "admin",
    actorId: c.get("admin")!.id,
    action: "admin.voucher.create",
    targetKind: "voucher",
    targetId: id,
  });
  return ok(c, { id });
});

app.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success)
    return fail(c, "validation", firstIssueMessage(parsed.error, "Form voucher tidak valid."), 400, parsed.error.flatten());
  const ts = now();
  await c.env.DB.prepare(
    `UPDATE vouchers SET code=?, description=?, discount_type=?, discount_value=?, max_discount_cents=?,
                         min_subtotal_cents=?, scope_type=?, scope_ref_id=?, total_quota=?, per_user_quota=?,
                         active_from=?, active_until=?, is_active=?, updated_at=?
       WHERE id=?`,
  )
    .bind(
      parsed.data.code.toUpperCase(),
      parsed.data.description ?? null,
      parsed.data.discountType,
      parsed.data.discountValue,
      parsed.data.maxDiscountCents ?? null,
      parsed.data.minSubtotalCents,
      parsed.data.scopeType,
      parsed.data.scopeRefId ?? null,
      parsed.data.totalQuota ?? null,
      parsed.data.perUserQuota,
      parsed.data.activeFrom,
      parsed.data.activeUntil,
      parsed.data.isActive ? 1 : 0,
      ts,
      id,
    )
    .run();
  return ok(c, { ok: true });
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM vouchers WHERE id = ?").bind(id).run();
  return ok(c, { ok: true });
});

export default app;
