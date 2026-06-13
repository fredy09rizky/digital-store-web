-- 0010_drop_short_desc.sql
--
-- Tujuan:
--  Hapus kolom products.short_desc. Field "deskripsi singkat" disatukan ke
--  satu field "Deskripsi" saja. Pencarian katalog kini memakai kolom
--  description. Form admin tidak lagi punya dua kolom deskripsi yang
--  membingungkan; cukup satu "Deskripsi" (maks 2000 karakter di sisi aplikasi).
--
-- Catatan:
--  SQLite/D1 mendukung ALTER TABLE ... DROP COLUMN (dipakai juga di migrasi
--  0006 & 0008). Tidak ada index yang bergantung pada kolom ini.

ALTER TABLE products DROP COLUMN short_desc;
