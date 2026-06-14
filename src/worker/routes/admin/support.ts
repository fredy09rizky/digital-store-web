import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/response";
import { now } from "../../lib/time";
import { nanoId } from "../../lib/id";
import { audit } from "../../lib/audit";
import { buildPage, parsePagination } from "../../lib/pagination";
import { sanitizeChatBody } from "../../lib/validation";

const app = new Hono<AppContext>({ strict: false });

// Daftar chat dengan pagination + search.
//   - status: open | closed
//   - q: cocokkan username ATAU kode order (chat refund). Chat support umum
//        (order_id NULL) hanya tercari lewat username.
app.get("/", async (c) => {
  const status = c.req.query("status") === "closed" ? "closed" : "open";
  const q = (c.req.query("q") ?? "").trim();
  const p = parsePagination({ query: (k) => c.req.query(k) });

  const where: string[] = ["sc.status = ?"];
  const binds: any[] = [status];
  if (q) {
    where.push("(u.username LIKE ? OR o.code LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }
  const whereSql = "WHERE " + where.join(" AND ");

  const [rs, total] = await Promise.all([
    c.env.DB.prepare(
      `SELECT sc.id, sc.kind, sc.status, sc.unread_admin, sc.updated_at, u.username, o.code
         FROM support_chats sc
         JOIN users u ON u.id = sc.user_id
         LEFT JOIN orders o ON o.id = sc.order_id
        ${whereSql}
        ORDER BY sc.updated_at DESC
        LIMIT ? OFFSET ?`,
    )
      .bind(...binds, p.pageSize, p.offset)
      .all<any>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS c FROM support_chats sc
         JOIN users u ON u.id = sc.user_id
         LEFT JOIN orders o ON o.id = sc.order_id
        ${whereSql}`,
    )
      .bind(...binds)
      .first<{ c: number }>(),
  ]);
  return ok(c, buildPage(rs.results ?? [], total?.c ?? 0, p));
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const chat = await c.env.DB.prepare(
    `SELECT sc.*, u.username, o.code
       FROM support_chats sc
       JOIN users u ON u.id = sc.user_id
       LEFT JOIN orders o ON o.id = sc.order_id
      WHERE sc.id = ?`,
  )
    .bind(id)
    .first<any>();
  if (!chat) return fail(c, "not_found", "Chat tidak ditemukan.", 404);
  const msgs = await c.env.DB.prepare(
    "SELECT id, sender_kind, body, attachment_url, created_at FROM support_messages WHERE chat_id = ? ORDER BY created_at",
  )
    .bind(id)
    .all<any>();
  await c.env.DB.prepare("UPDATE support_chats SET unread_admin = 0, updated_at = ? WHERE id = ?")
    .bind(now(), id)
    .run();
  return ok(c, { chat, messages: msgs.results ?? [] });
});

const SendBody = z.object({ body: z.string().min(1).max(2000) });
// Admin boleh mengirim ke chat yang sudah closed (mis. catatan akhir / kirim
// akun pengganti). Yang tidak bisa mengirim ke chat closed hanya user.
app.post("/:id/send", async (c) => {
  const admin = c.get("admin")!;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = SendBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Pesan kosong.");
  const text = sanitizeChatBody(parsed.data.body);
  if (!text) return fail(c, "validation", "Pesan kosong.");
  const chat = await c.env.DB.prepare("SELECT id FROM support_chats WHERE id = ?").bind(id).first<{
    id: string;
  }>();
  if (!chat) return fail(c, "not_found", "Chat tidak ditemukan.", 404);
  const ts = now();
  await c.env.DB.prepare(
    "INSERT INTO support_messages (id, chat_id, sender_kind, body, created_at) VALUES (?, ?, 'admin', ?, ?)",
  )
    .bind(nanoId("sm"), id, text, ts)
    .run();
  await c.env.DB.prepare("UPDATE support_chats SET unread_user = unread_user + 1, updated_at = ? WHERE id = ?")
    .bind(ts, id)
    .run();
  await audit(c.env, {
    actorKind: "admin",
    actorId: admin.id,
    action: "admin.support.send",
    targetKind: "chat",
    targetId: id,
  });
  return ok(c, { ok: true });
});

// Tutup chat. Riwayat TIDAK langsung dihapus — chat ditandai closed dan akan
// dihapus total oleh cron setelah masa retensi (chat_retention_hours). User
// tidak bisa membalas lagi; admin masih bisa mengirim.
app.post("/:id/close", async (c) => {
  const admin = c.get("admin")!;
  const id = c.req.param("id");
  const chat = await c.env.DB.prepare("SELECT id, status FROM support_chats WHERE id = ?").bind(id).first<{
    id: string;
    status: string;
  }>();
  if (!chat) return fail(c, "not_found", "Chat tidak ditemukan.", 404);
  if (chat.status === "closed") return fail(c, "already_closed", "Chat sudah ditutup.");
  const ts = now();
  await c.env.DB.prepare(
    "UPDATE support_chats SET status='closed', closed_at=?, unread_user = unread_user + 1, updated_at=? WHERE id=?",
  )
    .bind(ts, ts, id)
    .run();
  // Pesan sistem agar user paham sesi sudah ditutup & akan dihapus otomatis.
  await c.env.DB.prepare(
    "INSERT INTO support_messages (id, chat_id, sender_kind, body, created_at) VALUES (?, ?, 'system', ?, ?)",
  )
    .bind(
      nanoId("sm"),
      id,
      "Chat telah ditutup oleh admin. Riwayat chat akan segera dihapus otomatis oleh sistem.",
      ts,
    )
    .run();
  await audit(c.env, {
    actorKind: "admin",
    actorId: admin.id,
    action: "admin.support.close",
    targetKind: "chat",
    targetId: id,
  });
  return ok(c, { ok: true });
});

// Download log chat (CSV)
app.get("/:id/log.csv", async (c) => {
  const id = c.req.param("id");
  const chat = await c.env.DB.prepare("SELECT id FROM support_chats WHERE id = ?").bind(id).first<{ id: string }>();
  if (!chat) return fail(c, "not_found", "Chat tidak ditemukan.", 404);
  const msgs = await c.env.DB.prepare(
    "SELECT sender_kind, body, created_at FROM support_messages WHERE chat_id = ? ORDER BY created_at",
  )
    .bind(id)
    .all<{ sender_kind: string; body: string; created_at: number }>();
  const header = "timestamp,sender,body\n";
  const rows = (msgs.results ?? [])
    .map((m) => `${m.created_at},${m.sender_kind},"${(m.body || "").replace(/"/g, '""')}"`)
    .join("\n");
  return new Response(header + rows, {
    headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="chat-${id}.csv"` },
  });
});

export default app;
