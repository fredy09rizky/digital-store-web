-- 0006_cleanup_and_retention.sql
--
-- Tujuan:
--  1. Hapus kolom payments.raw_response yang tidak pernah ditulis ulang
--     setelah migrasi 0002. Mengurangi ukuran row + menghilangkan asumsi
--     bahwa kolom debug ini bisa dipakai.
--  2. Set default app_settings.audit_log_retention_days = 365 untuk policy
--     retensi audit log. Cron prune akan baca nilai ini setiap menit.

-- 1. Drop kolom debug usang.
ALTER TABLE payments DROP COLUMN raw_response;

-- 2. Default retensi audit log (hari). Admin dapat ubah via /admin/maintenance.
INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES
 ('audit_log_retention_days', '365', strftime('%s','now'));
