import { Hono } from "hono";
import type { AppContext } from "./env";
import { attachContext } from "./middleware/common";
import { attachAuth, requireAdmin, requireUser } from "./middleware/auth";
import { blockOnMaintenance } from "./middleware/maintenance";
import { fail } from "./lib/response";
import { log } from "./lib/log";

import publicRoutes from "./routes/public";
import authRoutes from "./routes/auth";
import cartRoutes from "./routes/cart";
import checkoutRoutes from "./routes/checkout";
import ordersRoutes from "./routes/orders";
import accountRoutes from "./routes/account";
import supportRoutes from "./routes/support";
import uploadRoutes from "./routes/upload";
import filesRoutes from "./routes/files";
import adminAuthRoutes from "./routes/admin/auth";
import adminProductsRoutes from "./routes/admin/products";
import adminCategoriesRoutes from "./routes/admin/categories";
import adminUsersRoutes from "./routes/admin/users";
import adminOrdersRoutes from "./routes/admin/orders";
import adminVouchersRoutes from "./routes/admin/vouchers";
import adminReviewsRoutes from "./routes/admin/reviews";
import adminSupportRoutes from "./routes/admin/support";
import adminDashboardRoutes from "./routes/admin/dashboard";
import adminSettingsRoutes from "./routes/admin/settings";
import webhooksRoutes from "./routes/webhooks";
import { expireAllDueOrders } from "./services/order";

const app = new Hono<AppContext>({ strict: false });

app.use("*", attachContext);
app.use("/api/*", attachAuth);

// ----- Public -----
app.route("/api", publicRoutes);
app.route("/api/auth", authRoutes);

// File serving (public read)
app.route("/api/files", filesRoutes);

// Webhooks (public, signature dicek di handler)
app.route("/api/webhooks", webhooksRoutes);

// ----- User-only routes (mount per-prefix supaya tidak menelan path /api/admin) -----
app.use("/api/cart/*", requireUser);
app.use("/api/cart", requireUser);
app.route("/api/cart", cartRoutes);

app.use("/api/checkout/*", requireUser);
app.use("/api/checkout", requireUser);
app.use("/api/checkout/*", blockOnMaintenance);
app.use("/api/checkout", blockOnMaintenance);
app.route("/api/checkout", checkoutRoutes);

app.use("/api/orders/*", requireUser);
app.use("/api/orders", requireUser);
app.route("/api/orders", ordersRoutes);

app.use("/api/account/*", requireUser);
app.use("/api/account", requireUser);
app.route("/api/account", accountRoutes);

app.use("/api/support/*", requireUser);
app.use("/api/support", requireUser);
app.route("/api/support", supportRoutes);

const requireUserOrAdmin: import("hono").MiddlewareHandler<AppContext> = async (c, next) => {
  if (!c.get("user") && !c.get("admin")) return fail(c, "unauthenticated", "Login dibutuhkan.", 401);
  await next();
};

app.use("/api/upload", requireUserOrAdmin);
app.use("/api/upload/*", requireUserOrAdmin);
app.route("/api/upload", uploadRoutes);

// ----- Admin routes -----
app.route("/api/admin/auth", adminAuthRoutes);

const adminGuarded = new Hono<AppContext>({ strict: false });
adminGuarded.use("*", requireAdmin);
adminGuarded.route("/products", adminProductsRoutes);
adminGuarded.route("/categories", adminCategoriesRoutes);
adminGuarded.route("/users", adminUsersRoutes);
adminGuarded.route("/orders", adminOrdersRoutes);
adminGuarded.route("/vouchers", adminVouchersRoutes);
adminGuarded.route("/reviews", adminReviewsRoutes);
adminGuarded.route("/support", adminSupportRoutes);
adminGuarded.route("/dashboard", adminDashboardRoutes);
adminGuarded.route("/settings", adminSettingsRoutes);
adminGuarded.route("/upload", uploadRoutes);
app.route("/api/admin", adminGuarded);

// 404 untuk API
app.all("/api/*", (c) => fail(c, "not_found", "Endpoint tidak ditemukan.", 404));

// Static SPA fallback
app.get("*", async (c) => {
  // Serahkan ke ASSETS binding untuk static + SPA fallback yang dikonfigurasi di wrangler.toml
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
  // Scheduled handler untuk auto-expire & cleanup chat
  async scheduled(_event: ScheduledEvent, env: AppContext["Bindings"], _ctx: ExecutionContext) {
    const startedAt = Date.now();
    try {
      await expireAllDueOrders(env);

      // Hapus total chat yang sudah ditutup (closed) dan melewati masa retensi.
      // Masa retensi dibaca dinamis dari app_settings.chat_retention_hours
      // (sah: 24/48/72, default 24). Karena dihitung dari closed_at + retensi,
      // perubahan setting langsung berdampak ke chat closed yang sudah ada.
      const t = Math.floor(Date.now() / 1000);
      const retHoursRow = await env.DB.prepare(
        "SELECT value FROM app_settings WHERE key = 'chat_retention_hours'",
      ).first<{ value: string }>();
      let retHours = parseInt(retHoursRow?.value ?? "24", 10);
      if (![24, 48, 72].includes(retHours)) retHours = 24;
      const chatCutoff = t - retHours * 3600;
      const expired = await env.DB.prepare(
        "SELECT id FROM support_chats WHERE status = 'closed' AND closed_at IS NOT NULL AND closed_at <= ?",
      )
        .bind(chatCutoff)
        .all<{ id: string }>();
      let cleanedChats = 0;
      const ids = (expired.results ?? []).map((r) => r.id);
      if (ids.length > 0) {
        const stmts: D1PreparedStatement[] = [];
        for (const id of ids) {
          // Hapus pesan lalu hapus baris chat → chat hilang total di kedua sisi.
          stmts.push(env.DB.prepare("DELETE FROM support_messages WHERE chat_id = ?").bind(id));
          stmts.push(env.DB.prepare("DELETE FROM support_chats WHERE id = ?").bind(id));
        }
        await env.DB.batch(stmts);
        cleanedChats = ids.length;
      }

      // Prune audit_logs sesuai retensi. Rentang sah 30-365 hari (default 30).
      // Prune SELALU jalan (tidak ada opsi nonaktif). Per tick maksimal 1000
      // baris dihapus agar tidak membanjiri D1 sekaligus.
      const retSetting = await env.DB.prepare(
        "SELECT value FROM app_settings WHERE key = 'audit_log_retention_days'",
      ).first<{ value: string }>();
      let retDays = parseInt(retSetting?.value ?? "30", 10);
      if (!Number.isFinite(retDays)) retDays = 30;
      retDays = Math.min(365, Math.max(30, retDays));
      const cutoff = t - retDays * 86400;
      const r = await env.DB.prepare(
        `DELETE FROM audit_logs
          WHERE id IN (
            SELECT id FROM audit_logs WHERE created_at < ? LIMIT 1000
          )`,
      )
        .bind(cutoff)
        .run();
      // @ts-ignore meta exists
      const prunedAudit = r.meta?.changes ?? 0;

      log.info({
        event: "cron.tick",
        msg: "Cron run completed.",
        meta: {
          duration_ms: Date.now() - startedAt,
          cleaned_chats: cleanedChats,
          pruned_audit: prunedAudit,
        },
      });
    } catch (err) {
      log.error({ event: "cron.failed", msg: "Cron run gagal.", err });
    }
  },
};
