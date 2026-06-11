import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/response";
import { now } from "../../lib/time";
import { nanoId } from "../../lib/id";
import { audit } from "../../lib/audit";

const app = new Hono<AppContext>({ strict: false });

app.get("/", async (c) => {
  const status = c.req.query("status") ?? "open";
  const rs = await c.env.DB.prepare(
    `SELECT sc.*, u.username, o.code FROM support_chats sc
       JOIN users u ON u.id = sc.user_id
       JOIN orders o ON o.id = sc.order_id
      WHERE sc.status = ?
      ORDER BY sc.updated_at DESC LIMIT 200`,
  )
    .bind(status)
    .all<any>();
  return ok(c, rs.results ?? []);
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const chat = await c.env.DB.prepare("SELECT * FROM support_chats WHERE id = ?").bind(id).first<any>();
  if (!chat) return fail(c, "not_found", "Chat tidak ditemukan.", 404);
  // Cleanup otomatis bila lewat cleanup_at
  if (chat.cleanup_at && chat.cleanup_at <= now()) {
    await c.env.DB.prepare("DELETE FROM support_messages WHERE chat_id = ?").bind(id).run();
    return ok(c, { chat: { ...chat, archived: true }, messages: [] });
  }
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

const SendBody = z.object({ body: z.string().trim().min(1).max(2000) });
app.post("/:id/send", async (c) => {
  const admin = c.get("admin")!;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = SendBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Pesan kosong.");
  const chat = await c.env.DB.prepare("SELECT id, status FROM support_chats WHERE id = ?").bind(id).first<{
    id: string;
    status: string;
  }>();
  if (!chat) return fail(c, "not_found", "Chat tidak ditemukan.", 404);
  if (chat.status === "closed") return fail(c, "chat_closed", "Chat sudah ditutup.", 403);
  const ts = now();
  await c.env.DB.prepare(
    "INSERT INTO support_messages (id, chat_id, sender_kind, body, created_at) VALUES (?, ?, 'admin', ?, ?)",
  )
    .bind(nanoId("sm"), id, parsed.data.body, ts)
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

app.post("/:id/close", async (c) => {
  const admin = c.get("admin")!;
  const id = c.req.param("id");
  const ts = now();
  // Instant cleanup: hapus semua pesan saat chat ditutup, bukan menunda 24
  // jam. Lebih jelas untuk user (tidak ada riwayat melayang) dan menutup
  // permukaan retensi data yang tidak perlu. cleanup_at di-set NULL agar
  // cron tidak menyentuh chat ini lagi.
  await c.env.DB.prepare("DELETE FROM support_messages WHERE chat_id = ?").bind(id).run();
  await c.env.DB.prepare(
    "UPDATE support_chats SET status='closed', closed_at=?, cleanup_at=NULL, unread_user=0, unread_admin=0, updated_at=? WHERE id=?",
  )
    .bind(ts, ts, id)
    .run();
  // Sisakan satu pesan sistem yang menjelaskan apa yang terjadi, agar baik
  // user maupun admin paham mengapa riwayat tampak kosong saat dibuka.
  await c.env.DB.prepare(
    "INSERT INTO support_messages (id, chat_id, sender_kind, body, created_at) VALUES (?, ?, 'system', ?, ?)",
  )
    .bind(
      nanoId("sm"),
      id,
      "Sesi chat ditutup oleh admin. Riwayat pesan sudah dihapus untuk privasi.",
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
  const chat = await c.env.DB.prepare("SELECT * FROM support_chats WHERE id = ?").bind(id).first<any>();
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
