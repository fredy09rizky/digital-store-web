-- 0012_drop_review_images.sql
--
-- Fitur upload foto pada review dihapus (menghemat R2 storage & beban
-- moderasi gambar). Review kini berupa teks saja (UTF-8 + emoji, maks 500
-- karakter). Tabel review_images tidak lagi dipakai.
--
-- Tidak ada tabel lain yang mereferensikan review_images, jadi aman di-drop.

DROP TABLE IF EXISTS review_images;
