-- =====================================================================
--  RESET TOTAL DATA  —  DESTRUKTIF!
--  Menghapus SELURUH isi semua tabel (skema tetap). Jalankan lalu seed ulang:
--     wrangler d1 execute digital_store --remote --file=./seeds/reset.sql
--     wrangler d1 execute digital_store --remote --file=./seeds/seed.sql
--  Admin akan ter-seed ulang otomatis dari secret saat login pertama.
--  Urut hapus: anak -> induk (aman terhadap foreign key).
-- =====================================================================
DELETE FROM voucher_redemptions;
DELETE FROM reviews;
DELETE FROM support_messages;
DELETE FROM support_chats;
DELETE FROM payment_attempts;
DELETE FROM payments;
DELETE FROM order_items;
DELETE FROM wallet_transactions;
DELETE FROM product_inventory_items;
DELETE FROM cart_items;
DELETE FROM carts;
DELETE FROM orders;
DELETE FROM product_price_tiers;
DELETE FROM product_images;
DELETE FROM products;
DELETE FROM vouchers;
DELETE FROM audit_logs;
DELETE FROM users;
DELETE FROM admins;
DELETE FROM app_settings;
DELETE FROM categories;
