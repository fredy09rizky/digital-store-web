import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { fail, ok } from "../lib/response";
import { createOrderForUser, OrderError } from "../services/order";

const app = new Hono<AppContext>({ strict: false });

const Body = z.object({
  paymentMethod: z.enum(["qris", "bank_transfer", "wallet"]),
  voucherCode: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(280).optional(),
});

app.post("/", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Input checkout tidak valid.", 400);
  try {
    const r = await createOrderForUser(c.env, {
      userId: user.id,
      paymentMethod: parsed.data.paymentMethod,
      voucherCode: parsed.data.voucherCode || undefined,
      notes: parsed.data.notes,
    });
    return ok(c, r);
  } catch (e: any) {
    if (e instanceof OrderError) return fail(c, e.code, e.message, e.status, e.details);
    return fail(c, "internal", "Gagal memproses checkout.", 500);
  }
});

export default app;
