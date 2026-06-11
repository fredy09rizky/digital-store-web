import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { fail, ok } from "../lib/response";
import { now } from "../lib/time";
import { nanoId } from "../lib/id";
import { rateLimit } from "../lib/rate-limit";

const app = new Hono<AppContext>({ strict: false });

app.get("/orders/:idOrCode", async (c) => {
  const user = c.get("user")!;
  const o = await c.env.DB.prepare(
    "SELECT id FROM orders WHERE user_id = ? AND (id = ? OR code = ?)",
  )
    .bind(user.id, c.req.param("idOrCode"), c.req.param("idOrCode"))
    .first<{ id: string }>();
  if (!o) return fail(c, "not_found", "Order tidak ditemukan.", 404);

  const chat = await c.env.DB.prepare(
    "SELECT id, status, closed_at, cleanup_at FROM support_chats WHERE order_id = ?",
  )
    .bind(o.id)
    .first<{ id: string; status: string; closed_at: number | null; cleanup_at: number | null }>();
  if (!chat) {
    return ok(c, { chat: null, messages: [] });
  }
  // Cleanup otomatis bila lewat cleanup_at
  if (chat.cleanup_at && chat.cleanup_at <= now()) {
    await c.env.DB.prepare("DELETE FROM support_messages WHERE chat_id = ?").bind(chat.id).run();
    return ok(c, { chat: { ...chat, archived: true }, messages: [] });
  }
  const msgs = await c.env.DB.prepare(
    "SELECT id, sender_kind, body, attachment_url, created_at FROM support_messages WHERE chat_id = ? ORDER BY created_at",
  )
    .bind(chat.id)
    .all<any>();
  // Tandai pesan dari admin sudah dibaca oleh user
  await c.env.DB.prepare("UPDATE support_chats SET unread_user = 0, updated_at = ? WHERE id = ?")
    .bind(now(), chat.id)
    .run();
  return ok(c, { chat, messages: msgs.results ?? [] });
});

const SendBody = z.object({
  body: z.string().trim().min(1).max(2000),
});

app.post("/orders/:idOrCode/send", async (c) => {
  const user = c.get("user")!;
  // Anti spam: 30 pesan per menit per user. Kirim normal jauh di bawah ini.
  const rl = await rateLimit(c.env, {
    key: `rl:support_send:${user.id}`,
    windowSeconds: 60,
    max: 30,
  });
  if (!rl.allowed)
    return fail(c, "rate_limited", "Terlalu banyak pesan. Coba sebentar lagi.", 429);
  const o = await c.env.DB.prepare(
    "SELECT id FROM orders WHERE user_id = ? AND (id = ? OR code = ?)",
  )
    .bind(user.id, c.req.param("idOrCode"), c.req.param("idOrCode"))
    .first<{ id: string }>();
  if (!o) return fail(c, "not_found", "Order tidak ditemukan.", 404);

  const body = await c.req.json().catch(() => null);
  const parsed = SendBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Pesan kosong.");

  const ts = now();
  let chat = await c.env.DB.prepare(
    "SELECT id, status FROM support_chats WHERE order_id = ?",
  )
    .bind(o.id)
    .first<{ id: string; status: string }>();
  if (!chat) {
    const sid = nanoId("sc");
    await c.env.DB.prepare(
      "INSERT INTO support_chats (id, order_id, user_id, status, created_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?)",
    )
      .bind(sid, o.id, user.id, ts, ts)
      .run();
    chat = { id: sid, status: "open" };
  } else if (chat.status === "closed") {
    return fail(c, "chat_closed", "Sesi chat order ini sudah ditutup admin.", 403);
  }
  await c.env.DB.prepare(
    "INSERT INTO support_messages (id, chat_id, sender_kind, body, created_at) VALUES (?, ?, 'user', ?, ?)",
  )
    .bind(nanoId("sm"), chat.id, parsed.data.body, ts)
    .run();
  await c.env.DB.prepare(
    "UPDATE support_chats SET unread_admin = unread_admin + 1, updated_at = ? WHERE id = ?",
  )
    .bind(ts, chat.id)
    .run();
  return ok(c, { ok: true });
});

export default app;
