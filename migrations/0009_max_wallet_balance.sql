-- 0009_max_wallet_balance.sql
--
-- Tujuan:
--  Default setting batas saldo maksimal user (dalam rupiah penuh). Top up tidak
--  boleh membuat saldo melebihi nilai ini. Admin bisa mengubahnya dari
--  Pengaturan Sistem. Set 0 untuk menonaktifkan batas (saldo tak terbatas).
--
-- Catatan:
--  Kode juga punya fallback default 1.000.000 bila baris ini tidak ada, jadi
--  aman walau migrasi/seed belum dijalankan.

INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES
 ('max_wallet_balance_cents', '1000000', strftime('%s','now'));
