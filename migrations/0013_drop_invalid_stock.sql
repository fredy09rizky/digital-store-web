-- 0013_drop_invalid_stock.sql
--
-- Fitur "Tandai invalid" pada stok dihapus, diganti "Hapus stok" (menghapus
-- item available permanen). Status 'invalid' tidak lagi diproduksi, jadi sisa
-- baris ber-status 'invalid' (kalau ada) dibersihkan.
--
-- Catatan: hanya menghapus baris 'invalid'. Baris 'sold' (akun yang sudah
-- dibeli user) & 'reserved' (order berjalan) tetap utuh.

DELETE FROM product_inventory_items WHERE status = 'invalid';
