-- Seed produk contoh. Aman dijalankan ulang berkat OR IGNORE.
-- Catatan: SKU & slug dibuat statis di seed; admin akan generate baru saat membuat produk lewat UI.

INSERT OR IGNORE INTO products
 (id, sku, category_id, name, slug, description, short_desc, thumbnail_url,
  price_cents, sale_price_cents, duration_label, warranty_note, status,
  is_featured, sales_count, rating_sum, rating_count, created_at, updated_at)
VALUES
 ('prd_demo_netflix', 'netflix-1bln-demo01', 'cat_streaming',
  'Netflix Premium 1 Bulan', 'netflix-premium-1-bulan',
  'Akun Netflix Premium 1 bulan, kualitas 4K, 4 device sekaligus. Garansi penggantian selama masa aktif.',
  'Netflix Premium 1 bulan, 4K, 4 device.', NULL,
  35000, 29000, '1 bulan', 'Garansi penggantian akun selama masa aktif.',
  'active', 1, 142, 4 * 38, 38, strftime('%s','now'), strftime('%s','now')),

 ('prd_demo_chatgpt', 'chatgpt-1bln-demo01', 'cat_ai',
  'ChatGPT Plus 1 Bulan', 'chatgpt-plus-1-bulan',
  'Akun ChatGPT Plus 1 bulan dengan akses model terbaru. Garansi 7 hari penggantian akun.',
  'ChatGPT Plus 1 bulan akses penuh.', NULL,
  85000, NULL, '1 bulan', 'Garansi 7 hari penggantian akun.',
  'active', 1, 76, 5 * 22, 22, strftime('%s','now'), strftime('%s','now')),

 ('prd_demo_canva', 'canva-1bln-demo01', 'cat_productivity',
  'Canva Pro 1 Bulan', 'canva-pro-1-bulan',
  'Canva Pro 1 bulan untuk akses semua template, font, dan stok foto.',
  'Canva Pro 1 bulan, semua fitur.', NULL,
  18000, 15000, '1 bulan', NULL,
  'active', 0, 51, 5 * 14, 14, strftime('%s','now'), strftime('%s','now')),

 ('prd_demo_duolingo', 'duolingo-1bln-demo', 'cat_education',
  'Duolingo Super 1 Bulan', 'duolingo-super-1-bulan',
  'Duolingo Super 1 bulan tanpa iklan, unlimited hearts.',
  'Duolingo Super 1 bulan tanpa iklan.', NULL,
  12000, NULL, '1 bulan', NULL,
  'active', 0, 33, 4 * 10, 10, strftime('%s','now'), strftime('%s','now')),

 ('prd_demo_calm', 'calm-1bln-demo01', 'cat_lifestyle',
  'Calm Premium 1 Bulan', 'calm-premium-1-bulan',
  'Calm Premium untuk meditasi dan tidur lebih nyenyak.',
  'Calm Premium 1 bulan.', NULL,
  20000, NULL, '1 bulan', NULL,
  'active', 0, 12, 4 * 5, 5, strftime('%s','now'), strftime('%s','now')),

 ('prd_demo_jetbrains', 'jetbrains-1th-demo', 'cat_devtools',
  'JetBrains All Products Pack 1 Tahun', 'jetbrains-all-products-1-tahun',
  'Lisensi JetBrains All Products Pack 1 tahun, semua IDE termasuk WebStorm, IntelliJ, PyCharm.',
  'JetBrains All Products Pack 1 tahun.', NULL,
  280000, 240000, '12 bulan', 'Garansi aktivasi.',
  'active', 1, 18, 5 * 9, 9, strftime('%s','now'), strftime('%s','now'));
