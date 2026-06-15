import { Hono } from "hono";
import type { AppContext } from "../env";
import { audit } from "../lib/audit";
import { markOrderPaid, expireOrderIfDue } from "../services/order";
import { now } from "../lib/time";
import { nanoId } from "../lib/id";
import { loggerFor } from "../lib/log";

const app = new Hono<AppContext>({ strict: false });

interface PakasirWebhook {
  amount?: number;
  order_id?: string;
  project?: string;
  status?: string;
  payment_method?: string;
  completed_at?: string;
}

/**
 * Webhook Pakasir.
 *
 *   {
 *     "amount": 22000,
 *     "order_id": "240910HDE7C9",
 *     "project": "depodomain",
 *     "status": "completed",
 *     "payment_method": "qris",
 *     "completed_at": "2024-09-10T08:07:02.819+07:00"
 *   }
 *
 * Pakasir tidak mengirim signature/HMAC pada body, jadi kita verifikasi
 * dengan: cek match project + order_id + amount dengan record kita,
 * lalu lakukan double-check ke API Pakasir (transactiondetail) untuk
 * memastikan transaksi memang completed sebelum mark paid.
 */
app.post("/pakasir", async (c) => {
  const logger = loggerFor(c);
  const text = await c.req.text();
  let payload: PakasirWebhook;
  try {
    payload = JSON.parse(text) as PakasirWebhook;
  } catch {
    logger.warn({ event: "webhook.pakasir.invalid_json", msg: "Body bukan JSON valid." });
    return c.json({ ok: false, error: "invalid_json" }, 400);
  }

  const code = payload.order_id;
  const project = payload.project;
  const amount = payload.amount;
  const status = (payload.status ?? "").toLowerCase();

  // Catat hit webhook untuk audit, tanpa pernah trust input. Hanya simpan
  // field ringkas yang aman; raw body dapat berisi informasi yang tidak
  // perlu disimpan permanen di tabel audit.
  await audit(c.env, {
    actorKind: "system",
    action: "webhook.pakasir.received",
    meta: { project, order_id: code, amount, status },
    ip: c.get("ip"),
  });

  if (!code || !amount || !project) {
    return c.json({ ok: false, error: "missing_fields" }, 400);
  }
  if (c.env.PAKASIR_PROJECT && project !== c.env.PAKASIR_PROJECT) {
    return c.json({ ok: false, error: "project_mismatch" }, 400);
  }

  // Cari order berdasarkan code; verifikasi amount.
  const order = await c.env.DB.prepare(
    "SELECT id, status, total_cents, payment_method, user_id FROM orders WHERE code = ?",
  )
    .bind(code)
    .first<{ id: string; status: string; total_cents: number; payment_method: string; user_id: string }>();
  if (!order) return c.json({ ok: false, error: "order_not_found" }, 404);
  if (order.total_cents !== amount) {
    return c.json({ ok: false, error: "amount_mismatch" }, 400);
  }

  // Catat attempt
  const pay = await c.env.DB.prepare(
    "SELECT id FROM payments WHERE order_id = ?",
  )
    .bind(order.id)
    .first<{ id: string }>();
  if (pay) {
    // Simpan potongan kecil saja untuk debugging; cukup utk reka ulang.
    await c.env.DB.prepare(
      `INSERT INTO payment_attempts (id, payment_id, triggered_by, result, raw, created_at)
       VALUES (?, ?, 'webhook', ?, ?, ?)`,
    )
      .bind(nanoId("pa"), pay.id, status, text.slice(0, 500), now())
      .run();
  }

  if (status === "completed" || status === "paid" || status === "success") {
    // Webhook Pakasir tidak ditandatangani, jadi double-check ke
    // transactiondetail WAJIB sebelum mark paid. Bila kredensial Pakasir
    // belum di-set, kita TIDAK bisa memverifikasi — tolak (fail-closed)
    // alih-alih mempercayai body mentah yang bisa dipalsukan.
    if (!c.env.PAKASIR_API_KEY || !c.env.PAKASIR_PROJECT) {
      logger.error({
        event: "webhook.pakasir.not_configured",
        msg: "Webhook completed ditolak: kredensial Pakasir belum di-set, tidak bisa verifikasi.",
        meta: { code },
      });
      return c.json({ ok: false, error: "provider_not_configured" }, 503);
    }
    // Double-check: panggil transactiondetail untuk memastikan benar paid.
    {
      const usp = new URLSearchParams({
        project: c.env.PAKASIR_PROJECT,
        amount: String(amount),
        order_id: code,
        api_key: c.env.PAKASIR_API_KEY,
      });
      try {
        const r = await fetch(`https://app.pakasir.com/api/transactiondetail?${usp.toString()}`);
        const j = (await r.json()) as { transaction?: { status: string } };
        const truth = (j.transaction?.status ?? "").toLowerCase();
        if (truth !== "completed" && truth !== "paid" && truth !== "success") {
          logger.warn({
            event: "webhook.pakasir.double_check_failed",
            msg: "Status webhook tidak match dengan transactiondetail.",
            meta: { code, truth, claimed: status },
          });
          return c.json({ ok: false, error: "double_check_failed" }, 400);
        }
      } catch (err) {
        // Jika double-check gagal jaringan, tolak supaya tidak rentan spoof.
        logger.error({
          event: "webhook.pakasir.double_check_unreachable",
          msg: "Tidak bisa double-check ke Pakasir.",
          err,
          meta: { code },
        });
        return c.json({ ok: false, error: "double_check_unreachable" }, 502);
      }
    }
    if (order.status === "pending_payment") {
      await markOrderPaid(c.env, order.id, { source: order.payment_method as any });
    }
    return c.json({ ok: true });
  }

  if (status === "expired" || status === "failed" || status === "cancelled" || status === "canceled") {
    if (order.status === "pending_payment") {
      await expireOrderIfDue(c.env, order.id);
    }
    return c.json({ ok: true });
  }

  return c.json({ ok: true, note: "ignored" });
});

export default app;
