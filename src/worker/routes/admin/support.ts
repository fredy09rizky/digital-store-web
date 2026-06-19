import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/response";
import { now, formatWIB } from "../../lib/time";
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
      "Chat ditutup oleh admin. User tidak bisa membalas lagi, tapi admin masih dapat mengirim pesan terakhir. Riwayat akan dihapus otomatis oleh sistem setelah beberapa waktu.",
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

// ============================================================
//  Unduh log chat: CSV (ramah dibaca admin/Excel) & JSON (arsip lossless).
// ============================================================

interface ChatExport {
  chat: {
    id: string;
    kind: string;
    status: string;
    username: string;
    orderCode: string | null;
    createdAt: number;
    closedAt: number | null;
  };
  messages: { id: string; sender_kind: string; body: string; created_at: number }[];
}

async function loadChatExport(env: AppContext["Bindings"], id: string): Promise<ChatExport | null> {
  const chat = await env.DB.prepare(
    `SELECT sc.id, sc.kind, sc.status, sc.created_at, sc.closed_at, u.username, o.code
       FROM support_chats sc
       JOIN users u ON u.id = sc.user_id
       LEFT JOIN orders o ON o.id = sc.order_id
      WHERE sc.id = ?`,
  )
    .bind(id)
    .first<any>();
  if (!chat) return null;
  const msgs = await env.DB.prepare(
    "SELECT id, sender_kind, body, created_at FROM support_messages WHERE chat_id = ? ORDER BY created_at",
  )
    .bind(id)
    .all<{ id: string; sender_kind: string; body: string; created_at: number }>();
  return {
    chat: {
      id: chat.id,
      kind: chat.kind,
      status: chat.status,
      username: chat.username,
      orderCode: chat.code ?? null,
      createdAt: chat.created_at,
      closedAt: chat.closed_at ?? null,
    },
    messages: msgs.results ?? [],
  };
}

function kindLabel(kind: string): string {
  return kind === "refund" ? "Refund" : "Support umum";
}
function senderLabel(s: string): string {
  if (s === "admin") return "Admin";
  if (s === "system") return "Sistem";
  return "User";
}
/** Escape satu sel CSV: selalu dibungkus kutip, kutip internal digandakan. */
function csvCell(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

// Download log chat (CSV) — UTF-8 + BOM (emoji aman di Excel), timestamp WIB,
// dan baris metadata di atas tabel agar konteks chat ikut terbawa.
app.get("/:id/log.csv", async (c) => {
  const id = c.req.param("id");
  const data = await loadChatExport(c.env, id);
  if (!data) return fail(c, "not_found", "Chat tidak ditemukan.", 404);

  const meta: [string, string][] = [
    ["Chat ID", data.chat.id],
    ["Jenis", kindLabel(data.chat.kind)],
    ["Username", `@${data.chat.username}`],
    ["Kode Order", data.chat.orderCode ?? "-"],
    ["Status", data.chat.status],
    ["Dibuat", formatWIB(data.chat.createdAt)],
    ["Ditutup", data.chat.closedAt ? formatWIB(data.chat.closedAt) : "-"],
    ["Diunduh", formatWIB(now())],
  ];
  const lines: string[] = [];
  for (const [k, v] of meta) lines.push(`${csvCell(k)},${csvCell(v)}`);
  lines.push(""); // pemisah metadata ↔ tabel pesan
  lines.push(["Waktu (WIB)", "Pengirim", "Pesan"].map(csvCell).join(","));
  for (const m of data.messages) {
    lines.push([formatWIB(m.created_at), senderLabel(m.sender_kind), m.body || ""].map(csvCell).join(","));
  }
  // BOM + CRLF supaya Excel membaca UTF-8 dan baris dengan benar.
  const body = "\uFEFF" + lines.join("\r\n");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="chat-${id}.csv"`,
    },
  });
});

// Download log chat (JSON) — arsip lossless dengan metadata + tiap pesan
// menyertakan epoch mentah dan versi WIB yang terbaca.
app.get("/:id/log.json", async (c) => {
  const id = c.req.param("id");
  const data = await loadChatExport(c.env, id);
  if (!data) return fail(c, "not_found", "Chat tidak ditemukan.", 404);

  const ts = now();
  const payload = {
    chat: {
      id: data.chat.id,
      kind: data.chat.kind,
      status: data.chat.status,
      username: data.chat.username,
      orderCode: data.chat.orderCode,
      createdAt: data.chat.createdAt,
      createdAtWIB: formatWIB(data.chat.createdAt),
      closedAt: data.chat.closedAt,
      closedAtWIB: data.chat.closedAt ? formatWIB(data.chat.closedAt) : null,
    },
    exportedAt: ts,
    exportedAtWIB: formatWIB(ts),
    messageCount: data.messages.length,
    messages: data.messages.map((m) => ({
      id: m.id,
      sender: m.sender_kind,
      body: m.body,
      createdAt: m.created_at,
      createdAtWIB: formatWIB(m.created_at),
    })),
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="chat-${id}.json"`,
    },
  });
});

export default app;
