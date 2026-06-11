-- Index pendukung tambahan untuk hot path admin & cron.
--
-- 1. Audit log tanpa filter di-sort `ORDER BY created_at DESC`. Index
--    `(action, created_at DESC)` di migrasi 0001 tidak menutupi kasus tanpa
--    filter karena leading column-nya `action`. Tambahkan index pada
--    `created_at` saja agar ORDER BY tidak perlu full scan + filesort.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs (created_at DESC);

-- 2. Dashboard menghitung refund hari ini lewat
--      WHERE status='refunded' AND refunded_at >= ?
--    `idx_orders_status` membantu, tapi jangkauan refunded_at tetap perlu
--    scan. Index berikut memberi range scan langsung pada timestamp refund.
CREATE INDEX IF NOT EXISTS idx_orders_refunded_at
  ON orders (refunded_at)
  WHERE refunded_at IS NOT NULL;

-- 3. Cron cleanup support_chats memilih chat dengan cleanup_at <= now.
--    Sudah ada idx_support_chats_cleanup, tapi kita pertegas ekspektasi
--    NULL-skip via partial index supaya cron tidak menyentuh chat aktif.
CREATE INDEX IF NOT EXISTS idx_support_chats_cleanup_due
  ON support_chats (cleanup_at)
  WHERE cleanup_at IS NOT NULL;
