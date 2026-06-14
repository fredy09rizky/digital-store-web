-- 0011_chat_and_order_rework.sql
--
-- Tiga perubahan terkait rework chat support, request refund, dan retensi:
--
--  1) orders.kind ('purchase' | 'topup') + orders.refund_requested_at.
--     - `kind` menggantikan deteksi top up berbasis string `notes` yang rapuh.
--       Top up disembunyikan dari daftar pesanan user dan tidak bisa direfund.
--     - `refund_requested_at` menandai order yang refund-nya sudah pernah
--       diajukan, sehingga aturan "refund sekali per order" tetap berlaku
--       walaupun chat refund sudah dihapus total oleh cron.
--
--  2) Rebuild support_chats:
--     - `order_id` jadi NULLABLE supaya chat support umum (level akun, tidak
--       terikat order) bisa disimpan dengan order_id NULL.
--     - Tambah kolom `kind` ('refund' | 'support').
--     - Hapus kolom `cleanup_at` (tidak dipakai lagi; cron menghitung jadwal
--       hapus dinamis dari closed_at + chat_retention_hours).
--     Data chat lama dikosongkan untuk awal yang bersih (chat bersifat
--     ephemeral; tidak ada data historis yang perlu dipertahankan).
--
--  3) Settings:
--     - chat_retention_hours (default 24; nilai sah 24/48/72) — lama chat yang
--       sudah closed dibiarkan sebelum dihapus total oleh cron.
--     - audit_log_retention_days dipaksa ke 30 (default baru; rentang sah 30-365,
--       opsi "tidak dihapus" dihapus).

-- 1) Orders: tipe order + jejak refund request
ALTER TABLE orders ADD COLUMN kind TEXT NOT NULL DEFAULT 'purchase'; -- purchase | topup
ALTER TABLE orders ADD COLUMN refund_requested_at INTEGER;
UPDATE orders SET kind = 'topup' WHERE notes = 'Top up saldo' OR code LIKE 'TOP-%';

-- 2) Rebuild support_chats (order_id nullable + kind, tanpa cleanup_at)
PRAGMA defer_foreign_keys = TRUE;
DELETE FROM support_messages;
DELETE FROM support_chats;
DROP TABLE support_chats;
CREATE TABLE support_chats (
  id           TEXT PRIMARY KEY,
  order_id     TEXT REFERENCES orders(id) ON DELETE CASCADE, -- NULL untuk chat support umum
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'support',              -- refund | support
  status       TEXT NOT NULL DEFAULT 'open',                 -- open | closed
  closed_at    INTEGER,
  unread_user  INTEGER NOT NULL DEFAULT 0,
  unread_admin INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
-- Satu chat refund per order (NULL untuk support umum diizinkan ganda).
CREATE UNIQUE INDEX idx_support_chats_order ON support_chats(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_support_chats_user ON support_chats(user_id, kind);
CREATE INDEX idx_support_chats_status ON support_chats(status, closed_at);

-- 3) Settings
INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES
 ('chat_retention_hours', '24', strftime('%s','now'));
UPDATE app_settings SET value = '30', updated_at = strftime('%s','now') WHERE key = 'audit_log_retention_days';
INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES
 ('audit_log_retention_days', '30', strftime('%s','now'));
