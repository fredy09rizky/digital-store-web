-- Index pendukung untuk hot path yang sudah teridentifikasi.
--
-- 1. Reservasi stok (`tryReserveStock`) memilih baris available tertua per produk.
--    Index awal `(product_id, status)` sudah meredam pencarian, tapi `ORDER BY
--    created_at, id` di subselect masih berpotensi filesort saat satu produk
--    punya ribuan stok. Index komposit di bawah menutup kebutuhan urut + filter
--    sekaligus.
CREATE INDEX IF NOT EXISTS idx_inventory_fifo
  ON product_inventory_items (product_id, status, created_at, id);

-- 2. Dashboard admin menghitung saldo masuk hari ini lewat
--      WHERE direction='credit' AND kind='topup' AND created_at >= ?
--    Tanpa index ini, query melakukan scan tabel `wallet_transactions` penuh.
CREATE INDEX IF NOT EXISTS idx_wallet_kind_dir_created
  ON wallet_transactions (direction, kind, created_at);
