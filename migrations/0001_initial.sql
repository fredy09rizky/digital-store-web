-- ============================================================
--  SKEMA AWAL DIGITAL STORE
--  Catatan:
--   - Semua harga dalam satuan rupiah penuh (INTEGER), tidak ada desimal.
--   - Timestamp disimpan sebagai unix epoch detik (INTEGER).
--   - PRAGMA foreign_keys = ON harus diaktifkan oleh runtime D1 secara default.
-- ============================================================

CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  password_salt   TEXT NOT NULL,
  display_name    TEXT,
  status          TEXT NOT NULL DEFAULT 'active', -- active | disabled | deleted
  status_reason   TEXT,
  balance_cents   INTEGER NOT NULL DEFAULT 0,     -- saldo dalam rupiah penuh
  session_version INTEGER NOT NULL DEFAULT 1,     -- naik => semua sesi lama invalid
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_users_status ON users(status);

-- ============================================================
-- ADMIN
-- ============================================================
CREATE TABLE admins (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  password_salt   TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- ============================================================
-- KATEGORI
-- ============================================================
CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT, -- nama icon / emoji
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- ============================================================
-- PRODUK
-- ============================================================
CREATE TABLE products (
  id              TEXT PRIMARY KEY,
  sku             TEXT NOT NULL UNIQUE,
  category_id     TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  description     TEXT NOT NULL DEFAULT '',
  short_desc      TEXT NOT NULL DEFAULT '',
  thumbnail_url   TEXT,
  price_cents     INTEGER NOT NULL,                 -- harga normal
  sale_price_cents INTEGER,                         -- harga promo (nullable)
  duration_label  TEXT,                             -- "1 bulan", "permanen", null
  warranty_note   TEXT,
  badges          TEXT NOT NULL DEFAULT '[]',       -- JSON array of label string
  status          TEXT NOT NULL DEFAULT 'active',   -- active | hidden
  is_featured     INTEGER NOT NULL DEFAULT 0,
  sales_count     INTEGER NOT NULL DEFAULT 0,       -- jumlah unit terjual sukses
  rating_sum      INTEGER NOT NULL DEFAULT 0,       -- akumulasi rating untuk avg
  rating_count    INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_created_at ON products(created_at DESC);
CREATE INDEX idx_products_sales ON products(sales_count DESC);

CREATE TABLE product_images (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_product_images_product ON product_images(product_id);

-- Tier harga bertingkat berdasar quantity
CREATE TABLE product_price_tiers (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_qty     INTEGER NOT NULL,        -- minimum qty untuk tier ini (>=1)
  unit_price_cents INTEGER NOT NULL,   -- harga per unit di tier ini
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_price_tiers_product ON product_price_tiers(product_id, min_qty);

-- ============================================================
-- INVENTORY ITEM (per akun nyata)
-- status:
--   available  : siap dijual, tidak terkait order apapun
--   reserved   : sedang dipesan order yang belum lunas
--   sold       : sudah dilepas ke order yang lunas
--   invalid    : ditandai admin sebagai tidak terpakai
-- ============================================================
CREATE TABLE product_inventory_items (
  id              TEXT PRIMARY KEY,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  payload_email   TEXT NOT NULL,
  payload_password TEXT NOT NULL,
  payload_note    TEXT,
  payload_expiry  TEXT,
  payload_extra   TEXT,                          -- raw extras setelah field standar
  status          TEXT NOT NULL DEFAULT 'available',
  reserved_for_order_id TEXT,                    -- nullable
  sold_to_order_id      TEXT,                    -- nullable
  reserved_at     INTEGER,
  sold_at         INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_inventory_product_status ON product_inventory_items(product_id, status);
CREATE INDEX idx_inventory_reserved_order ON product_inventory_items(reserved_for_order_id);
CREATE INDEX idx_inventory_sold_order ON product_inventory_items(sold_to_order_id);

-- ============================================================
-- KERANJANG (per user)
-- ============================================================
CREATE TABLE carts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE cart_items (
  id          TEXT PRIMARY KEY,
  cart_id     TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty         INTEGER NOT NULL CHECK (qty > 0),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE(cart_id, product_id)
);
CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);

-- ============================================================
-- ORDER
-- status:
--   pending_payment | paid | expired | cancelled | refunded
-- payment_method:
--   qris | bank_transfer | wallet
-- ============================================================
CREATE TABLE orders (
  id                TEXT PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,        -- kode order yang user-friendly
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status            TEXT NOT NULL DEFAULT 'pending_payment',
  payment_method    TEXT NOT NULL,
  subtotal_cents    INTEGER NOT NULL,
  discount_cents    INTEGER NOT NULL DEFAULT 0,
  service_fee_cents INTEGER NOT NULL DEFAULT 0,
  total_cents       INTEGER NOT NULL,
  voucher_id        TEXT REFERENCES vouchers(id) ON DELETE SET NULL,
  voucher_code      TEXT,
  expires_at        INTEGER NOT NULL,            -- unix epoch detik
  paid_at           INTEGER,
  cancelled_at      INTEGER,
  expired_at        INTEGER,
  refunded_at       INTEGER,
  notes             TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_expires ON orders(expires_at);

CREATE TABLE order_items (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,             -- harga per unit setelah tier
  qty             INTEGER NOT NULL CHECK (qty > 0),
  subtotal_cents  INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ============================================================
-- PAYMENT (master pembayaran per order)
-- ============================================================
CREATE TABLE payments (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,                 -- pakasir | manual_bank | wallet | mock
  method          TEXT NOT NULL,                 -- qris | bank_transfer | wallet
  amount_cents    INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | success | failed | expired
  external_id     TEXT,
  qr_payload      TEXT,                          -- string isi QR / link
  bank_name       TEXT,
  bank_account    TEXT,
  bank_holder     TEXT,
  proof_url       TEXT,                          -- bukti transfer manual yang diupload user
  raw_response    TEXT,                          -- JSON debug
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- Catatan setiap kali polling/cek
CREATE TABLE payment_attempts (
  id          TEXT PRIMARY KEY,
  payment_id  TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL,                    -- user | system | admin | webhook
  result      TEXT NOT NULL,
  raw         TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_payment_attempts_pid ON payment_attempts(payment_id, created_at DESC);

-- ============================================================
-- WALLET (saldo internal)
-- ============================================================
CREATE TABLE wallet_transactions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                 -- topup | order_payment | refund | adjustment | reversal
  direction       TEXT NOT NULL,                 -- credit | debit
  amount_cents    INTEGER NOT NULL CHECK (amount_cents >= 0),
  balance_after_cents INTEGER NOT NULL,
  related_order_id TEXT,
  related_payment_id TEXT,
  note            TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_wallet_user ON wallet_transactions(user_id, created_at DESC);

-- ============================================================
-- VOUCHER
-- discount_type: percent | amount
-- scope_type   : all | category | product
-- ============================================================
CREATE TABLE vouchers (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  description     TEXT,
  discount_type   TEXT NOT NULL,
  discount_value  INTEGER NOT NULL,
  max_discount_cents INTEGER,                    -- cap diskon untuk percent
  min_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  scope_type      TEXT NOT NULL DEFAULT 'all',
  scope_ref_id    TEXT,                          -- product_id atau category_id sesuai scope
  total_quota     INTEGER,                       -- null = unlimited
  per_user_quota  INTEGER NOT NULL DEFAULT 1,
  used_count      INTEGER NOT NULL DEFAULT 0,
  active_from     INTEGER NOT NULL,
  active_until    INTEGER NOT NULL,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_vouchers_code ON vouchers(code);

CREATE TABLE voucher_redemptions (
  id          TEXT PRIMARY KEY,
  voucher_id  TEXT NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  discount_cents INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE(voucher_id, order_id)
);
CREATE INDEX idx_voucher_redemptions_user ON voucher_redemptions(voucher_id, user_id);

-- ============================================================
-- REVIEW
-- status: pending | approved | rejected | spam
-- ============================================================
CREATE TABLE reviews (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending',
  moderated_at INTEGER,
  moderation_note TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE(order_id, product_id, user_id)
);
CREATE INDEX idx_reviews_product_status ON reviews(product_id, status);

CREATE TABLE review_images (
  id          TEXT PRIMARY KEY,
  review_id   TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_review_images_review ON review_images(review_id);

-- ============================================================
-- SUPPORT CHAT (per order)
-- chat_status: open | closed
-- ============================================================
CREATE TABLE support_chats (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'open',
  closed_at   INTEGER,
  cleanup_at  INTEGER,                           -- waktu otomatis dibersihkan (24 jam setelah closed)
  unread_user INTEGER NOT NULL DEFAULT 0,
  unread_admin INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_support_chats_status ON support_chats(status);
CREATE INDEX idx_support_chats_cleanup ON support_chats(cleanup_at);

CREATE TABLE support_messages (
  id          TEXT PRIMARY KEY,
  chat_id     TEXT NOT NULL REFERENCES support_chats(id) ON DELETE CASCADE,
  sender_kind TEXT NOT NULL,                     -- user | admin | system
  body        TEXT NOT NULL,
  attachment_url TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_support_messages_chat ON support_messages(chat_id, created_at);

-- ============================================================
-- AUDIT / ADMIN LOG
-- ============================================================
CREATE TABLE audit_logs (
  id          TEXT PRIMARY KEY,
  actor_kind  TEXT NOT NULL,                     -- user | admin | system
  actor_id    TEXT,
  action      TEXT NOT NULL,                     -- e.g. user.login, admin.product.update
  target_kind TEXT,
  target_id   TEXT,
  meta        TEXT NOT NULL DEFAULT '{}',        -- JSON
  ip          TEXT,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_audit_actor ON audit_logs(actor_kind, actor_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at DESC);

-- ============================================================
-- APP SETTINGS (key-value sederhana)
-- ============================================================
CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
