-- Seed kategori awal.
-- Kolom `icon` sengaja NULL: ikon kategori di-generate otomatis dari slug/nama
-- via lucide (lihat src/client/lib/category-icons.tsx), jadi tidak perlu emoji.
INSERT OR IGNORE INTO categories (id, slug, name, description, icon, sort_order, created_at, updated_at) VALUES
 ('cat_streaming', 'streaming-hiburan', 'Streaming & Hiburan', 'Layanan streaming film, musik, dan hiburan digital.', NULL, 10, strftime('%s','now'), strftime('%s','now')),
 ('cat_ai',        'ai',                'AI',                  'Akun premium AI untuk produktivitas dan kreasi.',     NULL, 20, strftime('%s','now'), strftime('%s','now')),
 ('cat_productivity','produktivitas',   'Produktivitas',       'Tools yang membuat kerjamu jauh lebih cepat.',         NULL, 30, strftime('%s','now'), strftime('%s','now')),
 ('cat_education', 'edukasi',           'Edukasi',             'Akses kursus online dan platform belajar.',            NULL, 40, strftime('%s','now'), strftime('%s','now')),
 ('cat_lifestyle', 'kebugaran-gaya-hidup','Kebugaran & Gaya Hidup','Kesehatan, kebugaran, meditasi, gaya hidup digital.',  NULL, 50, strftime('%s','now'), strftime('%s','now')),
 ('cat_devtools',  'developer-tools',   'Developer Tools / Utilities','Tools untuk developer dan power user.',          NULL, 60, strftime('%s','now'), strftime('%s','now'));

-- Setting default
INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES
 ('maintenance_mode', '0', strftime('%s','now')),
 ('maintenance_message', 'Sistem checkout sedang dalam pemeliharaan singkat. Katalog tetap dapat diakses.', strftime('%s','now')),
 ('service_fee_cents', '0', strftime('%s','now')),
 ('max_wallet_balance_cents', '1000000', strftime('%s','now'));
