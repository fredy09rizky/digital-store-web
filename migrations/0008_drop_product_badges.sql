-- 0008_drop_product_badges.sql
--
-- Tujuan:
--  Hapus kolom products.badges. Field "label promo" manual ini tidak pernah
--  dirender di sisi pembeli (ProductCard menghitung sendiri label −X% / READY /
--  LARIS dari data), sehingga hanya jadi sumber kebingungan dan data mati.
--
-- Catatan:
--  SQLite/D1 mendukung ALTER TABLE ... DROP COLUMN (dipakai juga di migrasi 0006).
--  Tidak ada index yang bergantung pada kolom ini.

ALTER TABLE products DROP COLUMN badges;
