import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/response";
import { now } from "../../lib/time";
import { hashPassword } from "../../lib/hash";
import { audit } from "../../lib/audit";
import { consumeAdminAck } from "./auth";
import { creditWallet } from "../../services/order";
import { nanoId } from "../../lib/id";
import { buildPage, parsePagination } from "../../lib/pagination";

const app = new Hono<AppContext>({ strict: false });

app.get("/", async (c) => {
  const q = c.req.query("q") ?? "";
  const status = c.req.query("status") ?? "";
  const where: string[] = [];
  const binds: any[] = [];
  if (q) {
    where.push("(username LIKE ? OR email LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }
  if (status) {
    where.push("status = ?");
    binds.push(status);
  } else {
    // Default: sembunyikan user yang sudah di-soft delete dari daftar.
    where.push("status != 'deleted'");
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const p = parsePagination({ query: (k) => c.req.query(k) });

  const [rs, total] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, username, email, status, status_reason, balance_cents, created_at,
              EXISTS(SELECT 1 FROM orders o WHERE o.user_id = users.id) AS has_orders
         FROM users
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(...binds, p.pageSize, p.offset)
      .all<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS c FROM users ${whereSql}`)
      .bind(...binds)
      .first<{ c: number }>(),
  ]);
  const items = (rs.results ?? []).map((r: any) => ({ ...r, has_orders: !!r.has_orders }));
  return ok(c, buildPage(items, total?.c ?? 0, p));
});

const StatusBody = z.object({
  ack: z.string().min(1),
  status: z.enum(["active", "disabled", "deleted"]),
  reason: z.string().trim().max(300).optional(),
});

/**
 * Hapus / nonaktifkan / aktifkan user.
 *
 * Kebijakan untuk status="deleted" (hybrid soft/hard delete):
 *   - Tolak jika saldo > 0; admin harus nol-kan dulu lewat refund / adjust.
 *   - Jika user TIDAK pernah transaksi (orders kosong), lakukan hard delete.
 *     CASCADE akan ikut membersihkan cart_items, wallet_transactions,
 *     reviews, dan support_chats milik user.
 *   - Jika user pernah transaksi, lakukan soft delete: status='deleted',
 *     PII di-anonimkan, password hash dikosongkan, sesi di-invalidate.
 *     Riwayat order tetap utuh untuk audit & laporan.
 *
 * Pertimbangan keamanan: pesan error tetap pakai bahasa alami dan tidak
 * mengekspos detail SQL constraint.
 */
app.post("/:id/status", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req.json().catch(() => null);
  const parsed = StatusBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Input tidak valid.");
  const okAck = await consumeAdminAck(c.env, admin.id, parsed.data.ack);
  if (!okAck) return fail(c, "ack_required", "Konfirmasi password admin diperlukan.", 403);
  const id = c.req.param("id");
  const ts = now();

  if (parsed.data.status === "deleted") {
    const u = await c.env.DB.prepare(
      "SELECT id, balance_cents FROM users WHERE id = ?",
    )
      .bind(id)
      .first<{ id: string; balance_cents: number }>();
    if (!u) return fail(c, "not_found", "User tidak ditemukan.", 404);
    if (u.balance_cents > 0) {
      return fail(
        c,
        "balance_not_zero",
        `User masih punya saldo Rp${u.balance_cents.toLocaleString("id-ID")}. Refund atau turunkan saldo ke 0 sebelum hapus.`,
      );
    }
    const hasOrders = await c.env.DB.prepare(
      "SELECT 1 AS x FROM orders WHERE user_id = ? LIMIT 1",
    )
      .bind(id)
      .first<{ x: number }>();
    if (!hasOrders) {
      // Hard delete: tidak ada order yang tertaut, cascade akan bersihkan sisanya.
      await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
      await audit(c.env, {
        actorKind: "admin",
        actorId: admin.id,
        action: "admin.user.delete.hard",
        targetKind: "user",
        targetId: id,
        meta: { reason: parsed.data.reason },
      });
      return ok(c, { ok: true, mode: "hard" });
    }
    // Soft delete + anonymize. Username/email di-prefix `deleted_<id>` untuk
    // menjaga UNIQUE constraint dan tidak membuka slot lama yang ambigu.
    const stub = `deleted_${id}`;
    await c.env.DB.prepare(
      `UPDATE users SET
         status = 'deleted',
         status_reason = ?,
         username = ?,
         email = ?,
         display_name = NULL,
         password_hash = '',
         password_salt = '',
         session_version = session_version + 1,
         updated_at = ?
       WHERE id = ?`,
    )
      .bind(parsed.data.reason ?? null, stub, `${stub}@local`, ts, id)
      .run();
    await audit(c.env, {
      actorKind: "admin",
      actorId: admin.id,
      action: "admin.user.delete.soft",
      targetKind: "user",
      targetId: id,
      meta: { reason: parsed.data.reason },
    });
    return ok(c, { ok: true, mode: "soft" });
  }

  // status = active | disabled
  await c.env.DB.prepare(
    "UPDATE users SET status = ?, status_reason = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?",
  )
    .bind(parsed.data.status, parsed.data.reason ?? null, ts, id)
    .run();
  await audit(c.env, {
    actorKind: "admin",
    actorId: admin.id,
    action: "admin.user.status",
    targetKind: "user",
    targetId: id,
    meta: { status: parsed.data.status, reason: parsed.data.reason },
  });
  return ok(c, { ok: true });
});

const PasswordBody = z.object({
  ack: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});
app.post("/:id/password", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req.json().catch(() => null);
  const parsed = PasswordBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Form tidak valid.");
  const okAck = await consumeAdminAck(c.env, admin.id, parsed.data.ack);
  if (!okAck) return fail(c, "ack_required", "Konfirmasi password admin diperlukan.", 403);
  const id = c.req.param("id");
  const { hash, salt } = await hashPassword(parsed.data.newPassword);
  const ts = now();
  await c.env.DB.prepare(
    "UPDATE users SET password_hash=?, password_salt=?, session_version = session_version + 1, updated_at=? WHERE id=?",
  )
    .bind(hash, salt, ts, id)
    .run();
  await audit(c.env, {
    actorKind: "admin",
    actorId: admin.id,
    action: "admin.user.password.reset",
    targetKind: "user",
    targetId: id,
  });
  return ok(c, { ok: true });
});

// Maksimal nominal penyesuaian saldo manual oleh admin per satu kali aksi.
// Cap ini melindungi dari typo (mis. ketik kelebihan satu digit). Admin yang
// perlu menyesuaikan lebih besar dari ini bisa melakukan beberapa kali.
const MAX_BALANCE_ADJUST_CENTS = 1_000_000;

const BalanceBody = z.object({
  ack: z.string().min(1),
  amountCents: z.coerce
    .number()
    .int()
    .gte(-MAX_BALANCE_ADJUST_CENTS)
    .lte(MAX_BALANCE_ADJUST_CENTS),
  note: z.string().trim().max(200).optional(),
});
app.post("/:id/balance/adjust", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req.json().catch(() => null);
  const parsed = BalanceBody.safeParse(body);
  if (!parsed.success) {
    return fail(
      c,
      "validation",
      `Nominal harus bilangan bulat antara -Rp${MAX_BALANCE_ADJUST_CENTS.toLocaleString("id-ID")} dan +Rp${MAX_BALANCE_ADJUST_CENTS.toLocaleString("id-ID")}.`,
    );
  }
  if (parsed.data.amountCents === 0) return fail(c, "validation", "Nominal tidak boleh 0.");
  const okAck = await consumeAdminAck(c.env, admin.id, parsed.data.ack);
  if (!okAck) return fail(c, "ack_required", "Konfirmasi password admin diperlukan.", 403);
  const id = c.req.param("id");
  if (parsed.data.amountCents > 0) {
    await creditWallet(c.env, id, parsed.data.amountCents, {
      kind: "adjustment",
      note: parsed.data.note ?? "Penyesuaian saldo oleh admin",
    });
  } else {
    const amt = Math.abs(parsed.data.amountCents);
    const ts = now();
    // Compare-And-Swap: UPDATE hanya berhasil jika saldo cukup. Saldo tidak
    // pernah bisa minus karena WHERE balance_cents >= ?. Pakai RETURNING
    // supaya balance_after_cents yang dicatat sinkron dengan baris yang
    // baru saja dimutasi.
    const updated = await c.env.DB.prepare(
      `UPDATE users
          SET balance_cents = balance_cents - ?, updated_at = ?
        WHERE id = ? AND balance_cents >= ?
        RETURNING balance_cents`,
    )
      .bind(amt, ts, id, amt)
      .first<{ balance_cents: number }>();
    if (!updated) {
      const cur = await c.env.DB.prepare("SELECT balance_cents FROM users WHERE id = ?")
        .bind(id)
        .first<{ balance_cents: number }>();
      return fail(
        c,
        "insufficient_balance",
        `Saldo user tidak cukup. Saldo saat ini Rp${(cur?.balance_cents ?? 0).toLocaleString("id-ID")}, butuh Rp${amt.toLocaleString("id-ID")}.`,
      );
    }
    await c.env.DB.prepare(
      `INSERT INTO wallet_transactions (id, user_id, kind, direction, amount_cents, balance_after_cents, note, created_at)
       VALUES (?, ?, 'adjustment', 'debit', ?, ?, ?, ?)`,
    )
      .bind(
        nanoId("wt"),
        id,
        amt,
        updated.balance_cents,
        parsed.data.note ?? "Pengurangan saldo oleh admin",
        ts,
      )
      .run();
  }
  await audit(c.env, {
    actorKind: "admin",
    actorId: admin.id,
    action: "admin.user.balance.adjust",
    targetKind: "user",
    targetId: id,
    meta: { amount: parsed.data.amountCents },
  });
  return ok(c, { ok: true });
});

export default app;
