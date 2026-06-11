-- 0007_unique_price_tier.sql
--
-- Tujuan:
--  Memaksakan aturan "satu produk tidak boleh punya dua tier dengan min_qty
--  yang sama" di level database, bukan hanya di level aplikasi. Tier dengan
--  min_qty duplikat membuat pemilihan harga grosir ambigu.
--
-- Catatan:
--  Index lama `idx_price_tiers_product (product_id, min_qty)` dari migrasi 0001
--  bersifat NON-unik dan kolomnya identik dengan index unik ini. Karena itu kita
--  ganti (drop lalu buat ulang sebagai UNIQUE) agar tidak ada dua index redundan;
--  versi unik tetap melayani kebutuhan lookup/sort yang sama.
--
--  Jika kelak dijalankan pada database yang sudah berisi data duplikat, perintah
--  CREATE UNIQUE INDEX akan gagal — bersihkan duplikat lebih dulu. Pada DB kosong
--  (kondisi saat migrasi ini dibuat) tidak ada risiko tersebut.

DROP INDEX IF EXISTS idx_price_tiers_product;

CREATE UNIQUE INDEX IF NOT EXISTS idx_price_tiers_product_unique
  ON product_price_tiers (product_id, min_qty);
