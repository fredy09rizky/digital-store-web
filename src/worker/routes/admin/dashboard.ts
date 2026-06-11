import { Hono } from "hono";
import type { AppContext } from "../../env";
import { ok } from "../../lib/response";
import { now } from "../../lib/time";
import { buildPage, parsePagination } from "../../lib/pagination";

const app = new Hono<AppContext>({ strict: false });

app.get("/stats", async (c) => {
  const today = Math.floor(Date.now() / 1000);
  const startOfToday = today - (today % 86400);

  async function num(sql: string, ...binds: any[]): Promise<number> {
    const r = await c.env.DB.prepare(sql).bind(...binds).first<{ c: number }>();
    return r?.c ?? 0;
  }

  const [
    omzetToday,
    ordersPaid,
    ordersPending,
    ordersExpired,
    activeUsers,
    activeStock,
    pendingReviews,
    walletIn,
    refundsToday,
    activeVouchers,
    needAttention,
  ] = await Promise.all([
    num(
      "SELECT COALESCE(SUM(total_cents),0) AS c FROM orders WHERE status='paid' AND paid_at >= ?",
      startOfToday,
    ),
    num("SELECT COUNT(*) AS c FROM orders WHERE status='paid' AND paid_at >= ?", startOfToday),
    num("SELECT COUNT(*) AS c FROM orders WHERE status='pending_payment'"),
    num("SELECT COUNT(*) AS c FROM orders WHERE status='expired' AND expired_at >= ?", startOfToday),
    num("SELECT COUNT(*) AS c FROM users WHERE status='active'"),
    num("SELECT COUNT(*) AS c FROM product_inventory_items WHERE status='available'"),
    num("SELECT COUNT(*) AS c FROM reviews WHERE status='pending'"),
    num(
      "SELECT COALESCE(SUM(amount_cents),0) AS c FROM wallet_transactions WHERE direction='credit' AND kind='topup' AND created_at >= ?",
      startOfToday,
    ),
    num("SELECT COUNT(*) AS c FROM orders WHERE status='refunded' AND refunded_at >= ?", startOfToday),
    num("SELECT COUNT(*) AS c FROM vouchers WHERE is_active=1 AND active_until >= ?", today),
    num(
      "SELECT COUNT(*) AS c FROM support_chats WHERE status='open' AND unread_admin > 0",
    ),
  ]);

  // Best seller hari ini
  const bestSeller = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.thumbnail_url, SUM(oi.qty) AS sold
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id AND o.status='paid' AND o.paid_at >= ?
       JOIN products p ON p.id = oi.product_id
      GROUP BY p.id ORDER BY sold DESC LIMIT 5`,
  )
    .bind(startOfToday)
    .all<any>();

  return ok(c, {
    omzetTodayCents: omzetToday,
    ordersPaidToday: ordersPaid,
    ordersPending,
    ordersExpiredToday: ordersExpired,
    activeUsers,
    activeStock,
    pendingReviews,
    walletInTodayCents: walletIn,
    refundsToday,
    activeVouchers,
    chatsNeedAttention: needAttention,
    bestSellersToday: bestSeller.results ?? [],
  });
});

app.get("/audit", async (c) => {
  const action = c.req.query("action");
  const where: string[] = [];
  const binds: any[] = [];
  if (action) {
    where.push("action LIKE ?");
    binds.push(`%${action}%`);
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const p = parsePagination({ query: (k) => c.req.query(k) });

  const [rs, total] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM audit_logs ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(...binds, p.pageSize, p.offset)
      .all<any>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS c FROM audit_logs ${whereSql}`)
      .bind(...binds)
      .first<{ c: number }>(),
  ]);
  return ok(c, buildPage(rs.results ?? [], total?.c ?? 0, p));
});

// Export laporan CSV (transaksi sukses)
app.get("/reports/transactions.csv", async (c) => {
  const from = parseInt(c.req.query("from") ?? "0", 10) || 0;
  const to = parseInt(c.req.query("to") ?? `${now()}`, 10) || now();
  const rs = await c.env.DB.prepare(
    `SELECT o.code, o.payment_method, o.total_cents, o.paid_at, u.username
       FROM orders o JOIN users u ON u.id = o.user_id
      WHERE o.status='paid' AND o.paid_at BETWEEN ? AND ?
      ORDER BY o.paid_at`,
  )
    .bind(from, to)
    .all<any>();
  const header = "code,method,total_cents,paid_at,username\n";
  const rows = (rs.results ?? [])
    .map((r: any) => `${r.code},${r.payment_method},${r.total_cents},${r.paid_at},${r.username}`)
    .join("\n");
  return new Response(header + rows, {
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="transactions.csv"`,
    },
  });
});

export default app;
