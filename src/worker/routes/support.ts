import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { fail, ok } from "../lib/response";
import { now } from "../lib/time";
import { nanoId } from "../lib/id";
import { rateLimit } from "../lib/rate-limit";
import { sanitizeChatBody } from "../lib/validation";

const app = new Hono<AppContext>({ strict: false });

const SendBody = z.object({
  body: z.string().min(1).max(2000),
});

// ============================================================
//  CHAT REFUND (per order)
// ============================================================
// Chat refund hanya dibuat lewat POST /account/refund-request. Endpoint ini
// hanya membaca / membalas chat yang sudah ada. Tidak pernah membuat chat
// baru — kalau belum ada (belum pernah ajukan refund), kembalikan chat null.

app.get("/orders/:idOrCode", async (c) => {
  const user = c.get("user")!;
  const o = await c.env.DB.prepare(
    "SELECT id FROM orders WHERE user_id = ? AND (id = ? OR code = ?)",
  )
    .bind(user.id, c.req.param("idOrCode"), c.req.param("idOrCode"))
    .first<{ id: string }>();
  if (!o) return fail(c, "not_found", "Order tidak ditemukan.", 404);

  const chat = await c.env.DB.prepare(
    "SELECT id, status, closed_at FROM support_chats WHERE order_id = ? AND kind = 'refund'",
  )
    .bind(o.id)
    .first<{ id: string; status: string; closed_at: number | null }>();
  if (!chat) return ok(c, { chat: null, messages: [] });

  const msgs = await c.env.DB.prepare(
    "SELECT id, sender_kind, body, attachment_url, created_at FROM support_messages WHERE chat_id = ? ORDER BY created_at",
  )
    .bind(chat.id)
    .all<any>();
  await c.env.DB.prepare("UPDATE support_chats SET unread_user = 0, updated_at = ? WHERE id = ?")
    .bind(now(), chat.id)
    .run();
  return ok(c, { chat, messages: msgs.results ?? [] });
});

app.post("/orders/:idOrCode/send", async (c) => {
  const user = c.get("user")!;
  const rl = await rateLimit(c.env, {
    key: `rl:support_send:${user.id}`,
    windowSeconds: 60,
    max: 30,
  });
  if (!rl.allowed) return fail(c, "rate_limited", "Terlalu banyak pesan. Coba sebentar lagi.", 429);
  const o = await c.env.DB.prepare(
    "SELECT id FROM orders WHERE user_id = ? AND (id = ? OR code = ?)",
  )
    .bind(user.id, c.req.param("idOrCode"), c.req.param("idOrCode"))
    .first<{ id: string }>();
  if (!o) return fail(c, "not_found", "Order tidak ditemukan.", 404);

  const body = await c.req.json().catch(() => null);
  const parsed = SendBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Pesan kosong.");
  const text = sanitizeChatBody(parsed.data.body);
  if (!text) return fail(c, "validation", "Pesan kosong.");

  const chat = await c.env.DB.prepare(
    "SELECT id, status FROM support_chats WHERE order_id = ? AND kind = 'refund'",
  )
    .bind(o.id)
    .first<{ id: string; status: string }>();
  if (!chat) return fail(c, "no_chat", "Chat refund belum dibuka. Ajukan refund terlebih dulu.", 404);
  if (chat.status === "closed")
    return fail(c, "chat_closed", "Chat sudah ditutup admin.", 403);

  await appendUserMessage(c.env, chat.id, text);
  return ok(c, { ok: true });
});

// ============================================================
//  CHAT SUPPORT UMUM (level akun, tidak terikat order)
// ============================================================
// Satu chat support aktif per user. Dibuat saat user mengirim pesan pertama.
// Setelah ditutup admin, user tidak bisa mengirim lagi; cron menghapus total
// setelah masa retensi, lalu user bisa memulai chat baru.

async function latestSupportChat(env: AppContext["Bindings"], userId: string) {
  return env.DB.prepare(
    "SELECT id, status, closed_at FROM support_chats WHERE user_id = ? AND kind = 'support' ORDER BY created_at DESC LIMIT 1",
  )
    .bind(userId)
    .first<{ id: string; status: string; closed_at: number | null }>();
}

app.get("/general", async (c) => {
  const user = c.get("user")!;
  const chat = await latestSupportChat(c.env, user.id);
  if (!chat) return ok(c, { chat: null, messages: [] });
  const msgs = await c.env.DB.prepare(
    "SELECT id, sender_kind, body, attachment_url, created_at FROM support_messages WHERE chat_id = ? ORDER BY created_at",
  )
    .bind(chat.id)
    .all<any>();
  await c.env.DB.prepare("UPDATE support_chats SET unread_user = 0, updated_at = ? WHERE id = ?")
    .bind(now(), chat.id)
    .run();
  return ok(c, { chat, messages: msgs.results ?? [] });
});

app.post("/general/send", async (c) => {
  const user = c.get("user")!;
  const rl = await rateLimit(c.env, {
    key: `rl:support_send:${user.id}`,
    windowSeconds: 60,
    max: 30,
  });
  if (!rl.allowed) return fail(c, "rate_limited", "Terlalu banyak pesan. Coba sebentar lagi.", 429);

  const body = await c.req.json().catch(() => null);
  const parsed = SendBody.safeParse(body);
  if (!parsed.success) return fail(c, "validation", "Pesan kosong.");
  const text = sanitizeChatBody(parsed.data.body);
  if (!text) return fail(c, "validation", "Pesan kosong.");

  const ts = now();
  let chat = await latestSupportChat(c.env, user.id);
  if (chat && chat.status === "closed")
    return fail(c, "chat_closed", "Chat sudah ditutup admin.", 403);
  if (!chat) {
    const sid = nanoId("sc");
    await c.env.DB.prepare(
      "INSERT INTO support_chats (id, order_id, user_id, kind, status, created_at, updated_at) VALUES (?, NULL, ?, 'support', 'open', ?, ?)",
    )
      .bind(sid, user.id, ts, ts)
      .run();
    chat = { id: sid, status: "open", closed_at: null };
  }
  await appendUserMessage(c.env, chat.id, text);
  return ok(c, { ok: true });
});

async function appendUserMessage(env: AppContext["Bindings"], chatId: string, text: string) {
  const ts = now();
  await env.DB.prepare(
    "INSERT INTO support_messages (id, chat_id, sender_kind, body, created_at) VALUES (?, ?, 'user', ?, ?)",
  )
    .bind(nanoId("sm"), chatId, text, ts)
    .run();
  await env.DB.prepare(
    "UPDATE support_chats SET unread_admin = unread_admin + 1, updated_at = ? WHERE id = ?",
  )
    .bind(ts, chatId)
    .run();
}

export default app;
