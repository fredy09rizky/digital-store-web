import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/response";
import { now } from "../../lib/time";
import { audit } from "../../lib/audit";

const app = new Hono<AppContext>({ strict: false });

app.get("/", async (c) => {
  const status = c.req.query("status") ?? "pending";
  const rs = await c.env.DB.prepare(
    `SELECT r.*, u.username, p.name AS product_name FROM reviews r
       JOIN users u ON u.id = r.user_id
       JOIN products p ON p.id = r.product_id
      WHERE r.status = ?
      ORDER BY r.created_at DESC LIMIT 200`,
  )
    .bind(status)
    .all<any>();
  return ok(c, rs.results ?? []);
});

const ModBody = z.object({
  status: z.enum(["approved", "rejected", "spam"]),
  note: z.string().max(300).optional(),
});

app.post("/:id/moderate", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = ModBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Form moderasi tidak valid.");
  const ts = now();
  const cur = await c.env.DB.prepare(
    "SELECT id, product_id, rating, status FROM reviews WHERE id = ?",
  )
    .bind(id)
    .first<{ id: string; product_id: string; rating: number; status: string }>();
  if (!cur) return fail(c, "not_found", "Review tidak ditemukan.", 404);
  await c.env.DB.prepare(
    "UPDATE reviews SET status=?, moderated_at=?, moderation_note=?, updated_at=? WHERE id=?",
  )
    .bind(parsed.data.status, ts, parsed.data.note ?? null, ts, id)
    .run();
  // Update agregat rating produk hanya saat transisi ke/keluar approved
  if (cur.status !== "approved" && parsed.data.status === "approved") {
    await c.env.DB.prepare(
      "UPDATE products SET rating_sum = rating_sum + ?, rating_count = rating_count + 1, updated_at = ? WHERE id = ?",
    )
      .bind(cur.rating, ts, cur.product_id)
      .run();
  } else if (cur.status === "approved" && parsed.data.status !== "approved") {
    await c.env.DB.prepare(
      "UPDATE products SET rating_sum = rating_sum - ?, rating_count = MAX(0, rating_count - 1), updated_at = ? WHERE id = ?",
    )
      .bind(cur.rating, ts, cur.product_id)
      .run();
  }
  await audit(c.env, {
    actorKind: "admin",
    actorId: c.get("admin")!.id,
    action: "admin.review.moderate",
    targetKind: "review",
    targetId: id,
    meta: { status: parsed.data.status },
  });
  return ok(c, { ok: true });
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM reviews WHERE id = ?").bind(id).run();
  return ok(c, { ok: true });
});

export default app;
