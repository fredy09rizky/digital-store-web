-- Hapus kompatibilitas stok lama sepenuhnya. Stok kini SELALU "konten bebas":
-- satu kolom `payload_content` (NOT NULL) yang disimpan & dikirim apa adanya.
--
-- Rebuild tabel: buang kolom akun lama (payload_email/password/note/expiry/extra).
-- DROP menghapus baris stok yang ada — disengaja (reset). Tidak ada tabel lain
-- yang mereferensikan tabel ini lewat FK, jadi aman di-drop & dibuat ulang.
DROP TABLE IF EXISTS product_inventory_items;

CREATE TABLE product_inventory_items (
  id              TEXT PRIMARY KEY,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  payload_content TEXT NOT NULL,                 -- konten bebas, maks 2000 char (dijaga app)
  status          TEXT NOT NULL DEFAULT 'available', -- available | reserved | sold
  reserved_for_order_id TEXT,
  sold_to_order_id      TEXT,
  reserved_at     INTEGER,
  sold_at         INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_inventory_product_status ON product_inventory_items(product_id, status);
CREATE INDEX idx_inventory_reserved_order ON product_inventory_items(reserved_for_order_id);
CREATE INDEX idx_inventory_sold_order ON product_inventory_items(sold_to_order_id);
