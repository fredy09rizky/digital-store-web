# Pasar Premium · Web Store Digital Item

Web store fullstack untuk menjual akun premium dan item digital lainnya, dibangun di atas Cloudflare Workers (Hono), Cloudflare D1, R2, dan KV. Frontend memakai React + Vite + Tailwind. Semua dalam satu repo, satu deployment, satu Worker.

> Backend menjadi sumber kebenaran. Stok dijaga atomik untuk mencegah double-sell. Pembayaran QRIS ditangani via Pakasir; transfer manual & saldo internal ditangani sendiri.

## Daftar isi

1. [Highlight](#highlight)
2. [Stack & Arsitektur](#stack--arsitektur)
3. [Struktur folder](#struktur-folder)
4. [Setup pertama kali](#setup-pertama-kali)
5. [Variabel lingkungan](#variabel-lingkungan)
6. [Pengembangan lokal](#pengembangan-lokal)
7. [Migrasi & seed database](#migrasi--seed-database)
8. [Deployment ke Cloudflare](#deployment-ke-cloudflare)
9. [Alur bisnis](#alur-bisnis)
10. [Race condition & atomicity](#race-condition--atomicity)
11. [Sistem stok & format upload](#sistem-stok--format-upload)
12. [Pembayaran (Pakasir QRIS)](#pembayaran-pakasir-qris)
13. [Voucher & harga spesial](#voucher--harga-spesial)
14. [Saldo internal & refund](#saldo-internal--refund)
15. [Review & rating](#review--rating)
16. [Support chat & refund](#support-chat--refund)
17. [Admin panel](#admin-panel)
18. [Maintenance mode](#maintenance-mode)
19. [Penghapusan user](#penghapusan-user)
20. [Header keamanan & CSP](#header-keamanan--csp)
21. [Logging](#logging)
22. [Keamanan](#keamanan)
23. [Logging & audit](#logging--audit)
24. [Halaman yang tersedia](#halaman-yang-tersedia)
25. [Troubleshooting](#troubleshooting)

---

## Highlight

- ⚙️ Fullstack di satu Worker. React/Vite di-serve via Workers Assets, API Hono melalui `/api/*`.
- 🔒 Sesi user & admin disimpan di KV dengan HMAC, otomatis invalid bila login dari device lain.
- 🛡️ OTP admin dikirim via Telegram bot, dengan rate-limit, expiry 5 menit, dan max 3 resend.
- 🧊 Reservasi stok atomik di D1 menggunakan UPDATE bersyarat plus double-check klausul status.
- 🧾 Pembayaran via QRIS / transfer bank manual / saldo internal. Provider abstraction siap pasang Pakasir.
- 🧠 Voucher fleksibel (segmen, persen/nominal, kuota total & per user, scope all/category/product), tidak tumpang dengan harga spesial.
- 💸 Saldo internal (top up QRIS, refund admin, adjustment), semua mutasi tercatat.
- 💬 Dua kanal chat: **support umum** (level akun, bebas tanya apa saja, tidak terikat order) dan **chat refund** (per order, otomatis dibuat saat user mengajukan refund). Ruang chat hanya dibuat saat dibutuhkan. Saat admin menutup chat, riwayat dihapus total otomatis oleh cron setelah masa retensi (24/48/72 jam, diatur admin). Admin punya pencarian + pagination dan bisa export CSV.
- 🧹 Cron tiap menit: auto-expire order pending, hapus total chat yang sudah ditutup melewati masa retensi, dan prune audit log sesuai retensi.
- 📱 UI responsive & premium (design system **"Aurora Noir"**: aksen iris/violet, tipografi Space Grotesk + Inter + JetBrains Mono) dengan **dark mode** (toggle + ikut sistem) dan microinteraction halus. Detail di [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).
- 🕒 Semua tanggal/waktu ditampilkan dalam zona **Asia/Jakarta (WIB, GMT+7)** dengan label "WIB" pada tampilan berjam. Invoice memakai warna tetap (light) saat dicetak/Save as PDF, tidak ikut dark mode.

---

## Stack & Arsitektur

| Layer | Teknologi | Catatan |
|------|-----------|---------|
| Edge runtime | Cloudflare Workers | Single fetch + scheduled handler |
| HTTP framework | Hono v4 | Rute API di `/api/*` |
| Bahasa | TypeScript 6 | Strict mode untuk worker dan client |
| Database | Cloudflare D1 (SQLite) | FK aktif, relasi normalisasi |
| Object storage | Cloudflare R2 | Thumbnail & galeri produk, bukti transfer |
| Key-Value | Cloudflare KV | Sesi, OTP, ack admin |
| Frontend | React 19 + React Router 7 | Lazy route, SPA fallback Workers Assets |
| Build tool | Vite 8 | Output ke `dist/client` |
| Styling | Tailwind CSS 4 | Tema CSS-first via `@theme` di `styles.css` (design system "Aurora Noir", dark mode) |
| Validasi | Zod 4 | Semua input di-parse di backend |
| CLI | Wrangler 4 | Compatibility date 2026-06-01 |

Diagram singkat:

```
┌─────────────────────────────┐         ┌─────────────────────────┐
│ React SPA (Vite static)     │         │ Cloudflare Workers      │
│ - katalog/keranjang/checkout│  ───►   │ - Hono API (/api/*)     │
│ - akun, payment, support    │         │ - Auth middleware       │
└──────────────┬──────────────┘         │ - Cron auto-expire      │
               │   GET /                │                         │
               ▼                        │  ┌──────────┐  ┌──────┐ │
        ASSETS binding                  │  │  D1 DB   │  │  KV  │ │
        (SPA fallback)                  │  └──────────┘  └──────┘ │
                                        │  ┌──────────┐           │
                                        │  │   R2     │           │
                                        │  └──────────┘           │
                                        └─────────────────────────┘
```

---

## Pembagian penyimpanan (apa pakai apa)

Ringkasan cepat agar mudah dijadikan rujukan: layanan mana menyimpan apa, dan kenapa.

| Layanan | Dipakai untuk | Sifat |
|---|---|---|
| **D1** (SQL) | Data inti & transaksional: user, produk, stok, order, pembayaran, saldo, voucher, review, chat, audit, settings | Sumber kebenaran, permanen |
| **KV** | Sesi login user/admin, OTP admin, token konfirmasi (ack) aksi sensitif admin | Sementara, ber-TTL, boleh hilang |
| **Durable Object** (`RATE_LIMITER`) | Rate-limit / anti-spam: login, OTP, register, top-up, upload, cek-status pembayaran, support | Counter atomik & global per-key |
| **R2** | File biner: thumbnail & galeri produk, bukti transfer manual | Objek/blob |

Catatan kuota:

- Rate-limit dulu memakai KV dan banyak menulis (terutama saat polling cek-status pembayaran tiap beberapa detik). Memindahkannya ke Durable Object **meringankan jatah tulis KV** secara signifikan; KV kini fokus pada sesi/OTP saja.
- Ini **memindahkan** beban (bukan menghilangkan biaya): Durable Object punya jatah gratis yang jauh lebih longgar, jadi lebih sehat untuk skala kecil–menengah.

---

## Struktur folder

```
digital-store-web-cf/
├─ migrations/                  # SQL skema D1
│  ├─ 0001_initial.sql
│  ├─ 0002_pakasir_fields.sql
│  ├─ 0003_manual_bank_settings.sql
│  ├─ 0004_perf_indexes.sql
│  ├─ 0005_more_perf_indexes.sql
│  ├─ 0006_cleanup_and_retention.sql
│  ├─ 0007_unique_price_tier.sql
│  ├─ 0008_drop_product_badges.sql
│  ├─ 0009_max_wallet_balance.sql
│  ├─ 0010_drop_short_desc.sql
│  ├─ 0011_chat_and_order_rework.sql
│  ├─ 0012_drop_review_images.sql
│  └─ 0013_drop_invalid_stock.sql
├─ seeds/                       # SQL seed kategori, settings, dan produk demo
│  ├─ seed.sql
│  └─ seed-products.sql
├─ scripts/                     # Skrip util build/dev
│  └─ ensure-dist-client.mjs    # Memastikan dist/client ada sebelum wrangler dev
├─ docs/                        # Dokumentasi tambahan
│  ├─ ARCHITECTURE.md
│  ├─ DESIGN_SYSTEM.md          # Sistem UI/UX "Aurora Noir" (token, komponen, dark mode)
│  └─ PAKASIR-INTEGRATION.md
├─ src/
│  ├─ shared/                   # Tipe & constant lintas client+worker
│  │  ├─ constants.ts
│  │  └─ types.ts
│  ├─ client/                   # Frontend React
│  │  ├─ index.html
│  │  ├─ main.tsx
│  │  ├─ App.tsx
│  │  ├─ styles.css             # @theme tokens + @utility (design system)
│  │  ├─ public/                # Aset statis (favicon.svg)
│  │  ├─ components/            # AppShell, Button, ProductCard, Toast, Alert,
│  │  │                         # ConfirmDialog, Empty, Loading, Pagination,
│  │  │                         # StatusPill, ThemeToggle, Thumbnail
│  │  ├─ lib/                   # api.ts, format.ts, hooks.ts, theme.ts,
│  │  │                         # category-icons.tsx
│  │  ├─ pages/                 # Halaman user
│  │  ├─ pages/admin/           # Halaman admin (+ admin-session.ts, AdminConfirm.tsx)
│  │  └─ state/                 # AppProviders.tsx, RouteGuards.tsx
│  └─ worker/                   # Backend Hono
│     ├─ index.ts               # Entry worker (fetch + scheduled)
│     ├─ env.ts                 # Tipe binding & context
│     ├─ middleware/            # auth, common, maintenance
│     ├─ lib/                   # hash, session, rate-limit, audit, ...
│     ├─ services/              # order, voucher, pricing, telegram, ...
│     ├─ services/payment/      # Pakasir provider (QRIS only)
│     └─ routes/                # Rute API per modul
│        └─ admin/              # Rute admin
├─ wrangler.toml
├─ vite.config.ts
├─ tsconfig.json
├─ tsconfig.client.json
├─ tsconfig.worker.json
├─ package.json
├─ package-lock.json
├─ .gitignore
├─ .dev.vars.example
└─ README.md
```

> Folder yang dibuat otomatis (tidak di-commit): `node_modules/`, `dist/` (output
> `vite build`), `.wrangler/` (state lokal Miniflare), `.vscode/`. File `.dev.vars`
> (secret lokal) juga tidak di-commit — gunakan `.dev.vars.example` sebagai acuan.

> Tailwind v4 menggunakan deklarasi tema CSS-first di `src/client/styles.css` lewat `@theme`. Tidak ada `tailwind.config.js` atau `postcss.config.js`.

---

## Setup pertama kali

Prasyarat:

- Node.js 20+
- Akun Cloudflare (free tier cukup)
- Wrangler login: `npx wrangler login`

Install dependency:

```bash
npm install
```

Buat resource Cloudflare (sekali saja):

```bash
# D1 database
npx wrangler d1 create digital_store
# salin database_id ke wrangler.toml -> [[d1_databases]] database_id

# KV namespace
npx wrangler kv namespace create digital_store_kv
# salin id ke wrangler.toml -> [[kv_namespaces]] id

# R2 bucket
npx wrangler r2 bucket create digital-store-assets
```

Buat file `.dev.vars` (untuk lokal) berisi minimal — atau salin saja dari `.dev.vars.example`:

```env
SESSION_SECRET=ganti-dengan-string-acak-min-32-karakter
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=ganti-dengan-password-awal-yang-kuat   # password plain saat seed pertama
TELEGRAM_BOT_TOKEN=                                         # opsional
TELEGRAM_CHAT_ID=                                           # opsional
PAKASIR_API_KEY=                                            # opsional saat dev (wajib utk QRIS)
PAKASIR_PROJECT=                                            # opsional saat dev (wajib utk QRIS)
```

> `ADMIN_PASSWORD_HASH` di-treat sebagai password plain saat tabel `admins` masih kosong. Sistem akan auto-hash dan menyimpannya ke DB pada login admin pertama. Setelah itu, ubah password lewat aksi admin atau langsung di DB. Variabel ini tidak dipakai lagi setelah seed admin terbentuk. Jangan biarkan nilai default mudah ditebak meski hanya di lingkungan dev.

Apply migrasi & seed lokal:

```bash
npm run db:migrate:local
npm run db:seed:local
```

---

## Variabel lingkungan

| Variabel | Lokasi | Deskripsi |
|---------|--------|-----------|
| `APP_NAME` | `vars` | Nama tampilan aplikasi. |
| `APP_ENV` | `vars` | `development` atau `production`. |
| `SESSION_TTL_SECONDS` | `vars` | TTL sesi user/admin (default 3600). |
| `ADMIN_OTP_TTL_SECONDS` | `vars` | TTL OTP admin (default 300). |
| `ADMIN_OTP_RESEND_COOLDOWN` | `vars` | Cooldown resend OTP (detik). |
| `ADMIN_OTP_MAX_RESENDS` | `vars` | Maksimal resend per ticket. |
| `PAYMENT_EXPIRY_SECONDS` | `vars` | Waktu kedaluwarsa order pending (detik). |
| `MAX_STOCK_PER_PRODUCT` | `vars` | Batas maksimal stok hidup (available + reserved) per produk (default 1000). Naikkan di `wrangler.toml` lalu deploy ulang bila perlu lebih banyak. |
| `SESSION_SECRET` | secret | Kunci HMAC sesi. WAJIB diisi (>= 32 karakter acak). |
| `ADMIN_USERNAME` | secret | Username admin awal (dipakai sekali saat seed). |
| `ADMIN_PASSWORD_HASH` | secret | Password plain pertama (otomatis di-hash saat seed admin). |
| `TELEGRAM_BOT_TOKEN` | secret | Token bot pengirim OTP admin. Opsional saat dev. |
| `TELEGRAM_CHAT_ID` | secret | Chat ID admin penerima OTP. Opsional saat dev. |
| `PAKASIR_API_KEY` | secret | API key proyek Pakasir. Wajib untuk QRIS. |
| `PAKASIR_PROJECT` | secret | Slug proyek Pakasir. Wajib untuk QRIS. |

> Info rekening transfer manual TIDAK lewat env. Diatur dari Admin Panel > Pengaturan Sistem.

Set secret di Cloudflare untuk production:

```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
# opsional
npx wrangler secret put PAKASIR_API_KEY
npx wrangler secret put PAKASIR_PROJECT
```

---

## Pengembangan lokal

Jalankan kedua proses (Vite dev server + Wrangler dev):

```bash
npm run dev
```

Akses:

- Worker API + halaman build: http://127.0.0.1:8787
- Vite dev (HMR client): http://127.0.0.1:5173 (proxy `/api` ke worker)

Saat development tanpa `TELEGRAM_BOT_TOKEN`, kode OTP admin di-log ke konsol Wrangler.

---

## Migrasi & seed database

```bash
# lokal
npm run db:migrate:local
npm run db:seed:local

# (opsional) seed katalog produk demo
npm run db:seed-products:local

# remote (Cloudflare)
npm run db:migrate:remote
npm run db:seed:remote
npm run db:seed-products:remote
```

Migrasi yang tersedia:

- `0001_initial.sql` — skema utama: users, admins, categories, products, product_images, product_price_tiers, product_inventory_items, carts, cart_items, orders, order_items, payments, payment_attempts, wallet_transactions, vouchers, voucher_redemptions, reviews, review_images, support_chats, support_messages, audit_logs, app_settings.
- `0002_pakasir_fields.sql` — kolom `display_amount_cents`, `fee_cents`, `expires_at_provider` di `payments` untuk integrasi Pakasir.
- `0003_manual_bank_settings.sql` — default settings transfer bank manual.
- `0004_perf_indexes.sql` — index pendukung performa: FIFO reservasi stok dan agregasi wallet_transactions di dashboard.
- `0005_more_perf_indexes.sql` — index tambahan: audit_logs ORDER BY created_at, refund cleanup, dan partial index cleanup support chat.
- `0006_cleanup_and_retention.sql` — drop kolom debug `payments.raw_response` yang tidak terpakai, dan default `audit_log_retention_days = 365`.
- `0007_unique_price_tier.sql` — ganti index `product_price_tiers(product_id, min_qty)` menjadi UNIQUE agar tidak ada dua tier grosir dengan min_qty sama per produk (integritas di level DB).
- `0008_drop_product_badges.sql` — hapus kolom `products.badges` (label promo manual yang tidak pernah dirender; label visual −X%/READY/LARIS dihitung otomatis dari data).
- `0009_max_wallet_balance.sql` — default setting `max_wallet_balance_cents` (batas saldo maksimal user, default Rp1.000.000; `0` = tanpa batas).
- `0010_drop_short_desc.sql` — hapus kolom `products.short_desc`. Deskripsi singkat & lengkap disatukan jadi satu field **Deskripsi** (maks 2000 karakter). Pencarian katalog kini memakai kolom `description`.
- `0011_chat_and_order_rework.sql` — (a) tambah `orders.kind` (`purchase`/`topup`) + `orders.refund_requested_at`; top up disembunyikan dari daftar pesanan dan tidak bisa direfund; (b) rebuild `support_chats`: `order_id` jadi nullable + kolom `kind` (`refund`/`support`), hapus `cleanup_at`, data chat lama dikosongkan; (c) setting `chat_retention_hours` (default 24) dan `audit_log_retention_days` dipaksa ke 30.
- `0012_drop_review_images.sql` — hapus tabel `review_images`. Fitur foto review dihapus; review kini teks saja.
- `0013_drop_invalid_stock.sql` — hapus baris stok ber-status `invalid`. Fitur "tandai invalid" diganti "hapus stok" (menghapus item `available` permanen); status `invalid` tidak lagi dipakai.

---

## Deployment ke Cloudflare

```bash
npm run build       # build client + typecheck worker
npm run deploy      # wrangler deploy
```

Catatan deployment:

1. Pastikan `wrangler.toml` sudah berisi `database_id` D1 dan `id` KV yang asli.
2. Cron `* * * * *` akan men-trigger handler `scheduled` setiap menit untuk auto-expire dan cleanup.
3. Static asset di-bundle dari `dist/client` lewat binding `ASSETS`. Routing SPA otomatis (`single-page-application`).
4. Untuk versi wrangler lama, `npm i -D wrangler@latest` jika menemui issue dengan binding `[assets]`.

---

## Alur bisnis

### 1. Browsing → Detail → Keranjang

- Beranda menampilkan produk terbaru (default), populer, promo, ready.
- Search bar di-submit dengan tombol kirim ke `/katalog?q=...`.
- Filter: kategori, range harga, ready stock, sort (terbaru, populer, terlaris, termurah, termahal).
- Detail produk menampilkan harga, label promo, stok, durasi, garansi, harga grosir, dan review approved (teks, berpaginasi). Galeri gambar utama dirender utuh (`object-contain` + backdrop blur) sehingga gambar dengan rasio non-4:3 tidak terpotong.
- Keranjang: jumlah (qty) bisa diatur lewat tombol +/- **atau diketik langsung** (memudahkan qty besar). Input di-commit saat blur/Enter, dengan validasi: tidak boleh 0/kosong (balik ke nilai semula) dan tidak melebihi stok tersedia (di-clamp). Batas qty per item adalah **stok tersedia** itu sendiri — divalidasi backend; tidak ada cap angka tetap (hanya ada sanity guard `CART_QTY_MAX` yang sangat tinggi untuk menolak input rusak).

### 2. Checkout

- Wajib login. Backend memvalidasi ulang harga, stok, dan voucher saat order dibuat.
- Sistem membuat order shell, lalu mereservasi stok atomik per produk. Jika gagal, order dihapus dan user diberi alasan jelas.
- Stok masuk status `reserved` dan tetap terkunci hingga pembayaran sukses atau order expired.
- Catatan order opsional, maksimal 200 karakter.

### 3. Pembayaran

- QRIS, transfer manual (upload bukti), atau saldo.
- Halaman pembayaran:
  - Countdown 5 menit (`PAYMENT_EXPIRY_SECONDS`).
- Tombol cek manual cooldown 10 detik (UI) + 4 detik server-side, supaya auto-poll 5s tidak ter-throttle.
  - Auto-poll adaptif 30s → 10s → 5s saat mendekati expired.
  - Tombol manual otomatis disabled saat <=15 detik tersisa, polling tetap berjalan.
  - Saat expired, tombol bayar dinonaktifkan, user diarahkan untuk membuat order baru.
- Saat status sukses, user diarahkan ke `/sukses/<code>`. Halaman sukses menampilkan ringkasan seperlunya (tanggal/waktu WIB, metode, daftar item + total, status, kode order) — **bukan** kredensial akun. Akun ditampilkan di detail pesanan, dan invoice dapat diunduh.

### 4. Pengiriman akun

- Begitu order paid, reservasi di `product_inventory_items` di-commit ke status `sold`.
- Email/password akun ditampilkan di **detail pesanan** (`/akun/pesanan/<code>`). Halaman sukses pembayaran hanya menampilkan ringkasan, **tidak** memuat kredensial demi keamanan. Invoice juga sengaja **tidak** memuat kredensial demi keamanan & menjaga ukuran PDF.
- Cron auto-expire akan melepas reservasi pada order yang tidak dibayar.

### 5. Setelah pembelian

- Akun saya: profil, saldo, mutasi, daftar order, detail order, invoice, bantuan/support, pengajuan refund, review.
- Refund: user mengajukan via tombol di order detail (sekali per order); backend membuka chat refund khusus order itu dan mengirim pesan otomatis. Admin dapat menyetujui yang masuk ke saldo, atau mengirim akun pengganti via chat.
- Review: hanya pembeli yang berhak. Berupa **teks saja** (UTF-8 + emoji, maks 500 karakter), status pending menunggu moderasi admin.

### Identitas user: username vs nama tampilan

- **Username** wajib, unik, dipakai untuk login. Di UI biasanya ditampilkan dengan prefix `@` (mis. `@budi123`).
- **Nama tampilan** (`display_name`) opsional (maks 60 karakter), diisi saat registrasi. Ini nama "ramah dibaca" yang ditampilkan ke user, tanpa prefix `@`.
- Aturan tampilan: **nama tampilan dipakai bila ada, jika kosong jatuh ke username**.
  - Avatar header memakai huruf pertama dari `displayName || username`.
  - Nama di drawer mobile dan kolom "Pelanggan" pada invoice memakai `displayName`; bila kosong → `@username`.
  - Halaman Akun tetap menampilkan keduanya (username sebagai identitas login + nama tampilan).
- **Review produk tetap memakai `@username`** (bukan nama tampilan) karena review bersifat publik — menghindari membocorkan nama asli ke pengunjung lain.
- `displayName` tersedia lewat `/api/bootstrap` (`user.displayName`) dan diisi dari `display_name` di middleware auth. Saat user di-soft delete, `display_name` di-set `NULL` (anonimisasi).

### Aturan registrasi akun

Divalidasi di backend (`routes/auth.ts`) dan dicerminkan di form (`RegisterPage.tsx`). Aturan dipusatkan di `src/shared/constants.ts` (validator + konstanta) agar client & worker konsisten; backend tetap sumber kebenaran.

- **Username**: 5–20 karakter, **hanya huruf, angka, dan garis bawah (`_`)**. Titik (`.`), plus (`+`), dan strip (`-`) ditolak. Disimpan lowercase dan wajib unik.
- **Email**: format valid, **hanya domain populer** yang diizinkan (Gmail/Googlemail, Outlook/Hotmail/Live/MSN, Yahoo/Yahoo.co.id/Ymail, iCloud/me/mac, Proton). Tidak boleh ada tanda `+`, dan **maksimal 3 titik** di seluruh email. Daftar domain ada di `ALLOWED_EMAIL_DOMAINS` (mudah ditambah).
- **Nama tampilan**: opsional, maksimal **30** karakter.
- **Password**: **10–30 karakter**, wajib huruf besar, huruf kecil, angka, dan **minimal satu simbol dari `@ ! # $ % & *`**. Hanya boleh huruf, angka, dan simbol tersebut (karakter lain ditolak).
- Policy password yang sama berlaku di **semua** jalur penetapan password: registrasi, **ganti password** user (`/auth/change-password`), dan **reset password user oleh admin** (`/admin/users/:id/password`).
- Pesan error dikembalikan spesifik per aturan (mis. "Email tidak boleh mengandung lebih dari 3 titik.") dan ditampilkan jelas di form, dilengkapi checklist syarat live.

---

## Race condition & atomicity

Reservasi stok dilakukan via dua langkah atomik di `services/inventory-reserve.ts`:

```sql
UPDATE product_inventory_items
   SET status='reserved', reserved_for_order_id=?, reserved_at=?, updated_at=?
 WHERE id IN (
   SELECT id FROM product_inventory_items
    WHERE product_id=? AND status='available'
    ORDER BY created_at, id
    LIMIT ?
 )
 AND status='available';
```

- Klausul `AND status='available'` setelah subselect berfungsi sebagai double-check terhadap baris yang sempat berubah pasca subselect.
- Setelah UPDATE, kita menghitung jumlah baris yang **benar-benar** terikat ke order ini.
- Jika kurang dari yang diminta, semua reservasi parsial untuk order itu dilepas (rollback) dan order dibatalkan.
- D1 menjalankan tiap statement sebagai unit atomik, sehingga dua request paralel akan diserialisasi pada level baris.

Perlindungan tambahan:

- `markOrderPaid` memakai `UPDATE ... WHERE status='pending_payment'` sebagai titik serialisasi.
- Pembayaran via saldo memotong saldo dengan `WHERE balance_cents >= amount` sehingga bebas dari over-debit.
- Voucher: insert `voucher_redemptions` memakai `INSERT OR IGNORE` plus increment `used_count` setelahnya, idempoten saat retry.

Klik ganda dan refresh tidak akan melahirkan order ganda karena order baru menyertakan reservasi stok atomik dan pembayaran adalah operasi idempotent (sudah `paid` → no-op).

---

## Sistem stok & format upload

Stok per produk disimpan per item nyata di `product_inventory_items`. Admin menambah stok via halaman Stok Produk:

- Paste teks atau import file `.txt`.
- Format: satu baris satu item, pemisah `|`.
- Field minimal: `email|password`. Tambahan opsional: `email|password|note|expired|extras...`.
- Whitespace di-trim. Baris kosong dan baris diawali `#` diabaikan.
- Parser fleksibel terhadap field tambahan (extras digabung ulang dengan `|`).

Contoh:

```
# komentar
user1@mail.com|password123|2FA off|2026-12-31
user2@mail.com|S3cret|extra info
example.com:rendahbanget|catatan
```

Aturan:

- Stok tidak bisa hanya berupa angka; admin harus mengupload data nyata.
- Stok aktif = jumlah baris dengan status `available`. `reserved` dan `sold` tidak ditampilkan ke katalog.
- Batas maksimal stok hidup (available + reserved) per produk dijaga oleh `MAX_STOCK_PER_PRODUCT` (default 1000). Upload yang membuat stok hidup melewati batas ditolak dengan kode `stock_limit_exceeded` yang menyebut sisa kuota. `sold` (historis) tidak dihitung terhadap batas. Untuk menaikkan batas, ubah `MAX_STOCK_PER_PRODUCT` di `wrangler.toml` lalu deploy ulang.
- Halaman Stok Produk admin menampilkan daftar item dengan **pagination** (50 per halaman). Statistik Total/Available/Reserved/Sold dihitung di server lewat agregasi `GROUP BY status`, jadi akurat lepas dari halaman yang sedang dibuka.
- Admin bisa menghapus stok terpilih (satu atau semua dalam satu halaman). **Hanya item `available` yang bisa dihapus** — item `reserved` (order berjalan) dan `sold` (sudah dibeli user, tampil di riwayat pesanan) tidak terpengaruh.
- Saat ada reservasi aktif, edit produk dikunci (`locked`). Hapus reservasi lewat order expired/cancel sebelum mengubah produk.

---

## Pembayaran (Pakasir QRIS)

Sumber: `src/worker/services/payment/`.

- `types.ts` mendefinisikan kontrak `PaymentProvider`.
- `pakasir-provider.ts` implementasi penuh client Pakasir QRIS.
- `index.ts -> pakasirProvider(env)` melempar error jika `PAKASIR_API_KEY` atau `PAKASIR_PROJECT` belum di-set; tidak ada fallback mock.

Untuk mengaktifkan QRIS:

1. Set secret `PAKASIR_API_KEY` & `PAKASIR_PROJECT` lewat `wrangler secret put`.
2. Selesai. Endpoint `/api/checkout` dengan `paymentMethod: "qris"` akan otomatis memanggil Pakasir.

Detail integrasi (endpoint, webhook, sandbox testing) ada di [`docs/PAKASIR-INTEGRATION.md`](docs/PAKASIR-INTEGRATION.md).

Polling status (UI):

- Tombol manual: 1 hit / 4 detik (rate-limit backend) plus cooldown 10 detik di UI agar auto-poll 5s tidak pernah ter-throttle.
- Auto-poll: 30s/10s/5s adaptif menurut sisa waktu.
- Backend mencatat tiap pengecekan ke `payment_attempts` untuk audit.

---

## Voucher & harga spesial

Voucher disimpan di tabel `vouchers`. Aturan dievaluasi di `services/voucher.ts`:

- `discount_type`: `percent` atau `amount`. Diskon `percent` dibatasi maksimal 100%.
- `scope_type`: `all`, `category`, atau `product`. Untuk `category`/`product`, `scope_ref_id` wajib diisi.
- Periode wajib valid: `active_until` harus setelah `active_from`.
- `total_quota`, `per_user_quota` divalidasi atomik via `voucher_redemptions` UNIQUE per `(voucher_id, order_id)`.
- Tidak menumpuk dengan harga spesial: jika item kena sale price atau tier yang lebih murah dari harga normal, item tersebut **tidak** ikut dihitung untuk eligible subtotal voucher.
- Hanya 1 voucher per order.

> Validasi di atas dijaga di backend (`routes/admin/vouchers.ts`) dan dicerminkan di form admin (tombol simpan nonaktif bila tidak valid).

Harga spesial / tier:

- Disimpan di `product_price_tiers` per produk.
- `effectiveUnitPrice(qty)` di backend memilih tier `min_qty <= qty` terbesar.
- Jika tier > base price, base price menang (safety guard).
- Saat input via admin: harga promo (`sale_price`) wajib lebih kecil dari harga normal, `min_qty` antar tier tidak boleh duplikat, dan harga tier tidak boleh lebih besar dari harga normal. `min_qty` unik per produk juga dijaga di DB lewat UNIQUE index (migrasi `0007`).

---

## Saldo internal & refund

- Saldo di-store di `users.balance_cents` plus tabel append-only `wallet_transactions` untuk audit trail.
- Top-up: user pilih nominal, sistem buat order khusus (`kind='topup'`) lewat provider QRIS yang sama. Setelah sukses, kredit otomatis masuk. Order top up **disembunyikan dari daftar pesanan** (sudah tercatat di mutasi saldo) dan **tidak bisa direfund** (tidak ada produk; refund hanya untuk pembelian).
- Refund:
  - User mengajukan refund via order detail. Refund hanya bisa diajukan **satu kali per order** — saat diajukan, sistem menandai `orders.refund_requested_at` dan membuka **chat refund** khusus order itu (mengirim pesan `[REFUND REQUEST]` otomatis), lalu user diarahkan ke chat tersebut.
  - Klik berikutnya di order yang sama: bila chat masih ada → masuk ke chat refund; bila admin sudah menutup & chat sudah dihapus → muncul info bahwa refund tidak bisa diajukan lagi.
  - Admin di order detail bisa klik tombol Refund (dengan konfirmasi password admin) → status order ke `refunded` dan saldo user dikredit.
  - Alternatif: admin kirim akun pengganti lewat chat tanpa refund.

Aturan saldo:

- Tidak ada withdraw keluar.
- Mutasi tercatat lengkap dengan `balance_after_cents`.
- Pemotongan saldo memakai `UPDATE ... WHERE balance_cents >= amount` agar aman race.
- Batas saldo maksimal (`max_wallet_balance_cents`, default Rp1.000.000, `0` = tanpa batas) membatasi top up: maksimal top up sekali = batas − (saldo sekarang + top up yang masih pending). Refund & penyesuaian admin tidak dibatasi nilai ini. Diatur dari Admin Panel > Pengaturan Sistem.

---

## Review & rating

- Hanya pembeli sukses pada order tertentu yang boleh memberi review (validasi via `orders` + `order_items` join).
- Review berupa **teks saja** — UTF-8 + emoji diizinkan, maksimal **500 karakter**, karakter kontrol dibuang (`sanitizeText`). **Tidak ada upload foto** (menghemat R2 storage & beban moderasi gambar).
- Default status `pending`. Hanya `approved` yang ikut menghitung agregat rating produk.
- Saat moderasi keluar/masuk `approved`, agregat (`rating_sum`, `rating_count`) di-update otomatis.
- Tampil di detail produk via endpoint terpisah berpaginasi (`GET /products/:slug/reviews`, 5 per halaman) sehingga produk dengan ratusan review tetap ringan.
- Admin bisa Approve / Reject / Spam / Hapus.

---

## Support chat & refund

Ada **dua kanal chat** yang terpisah:

1. **Chat support umum** — di level akun (`/akun/support`), tidak terikat order. User bisa bertanya apa saja (produk, kendala, dll). Satu chat aktif per user.
2. **Chat refund** — per order, dibuat otomatis saat user mengajukan refund dari detail pesanan. Berisi pesan `[REFUND REQUEST]` + alasan.

Aturan umum:

- **Ruang chat tidak lagi dibuat otomatis saat order paid.** Chat hanya lahir saat dibutuhkan (user buka Bantuan, atau ajukan refund). Ini mengurangi sampah data dan beban admin.
- Penempatan menu support umum di sisi user: tombol **Bantuan** di halaman Akun, link di drawer mobile, dan link di footer.
- **Tutup percakapan**: saat admin menutup chat, statusnya jadi `closed`, user **tidak bisa membalas lagi** dan melihat pesan sistem "Chat telah ditutup oleh admin. Riwayat chat akan segera dihapus otomatis oleh sistem." **Admin masih bisa mengirim** (mis. catatan akhir / akun pengganti).
- **Hapus total otomatis**: cron menghapus seluruh chat + pesan yang sudah `closed` setelah masa retensi **`chat_retention_hours`** (24/48/72 jam, default 24, diatur dari Admin Panel > Pengaturan). Setelah dihapus, chat hilang di kedua sisi.
- **Validasi**: pesan chat maks **1000 karakter** (UTF-8 + emoji diizinkan, karakter kontrol dibuang); alasan refund maks **500 karakter**.
- **Input**: `Enter` mengirim pesan; `Shift+Enter`, `Ctrl+Enter` (Windows), atau `Cmd+Enter` (Mac) membuat baris baru.
- **Admin**: halaman Support punya **pencarian** (username atau kode order) + **pagination**, label jenis chat (Refund · ORD-xxxx / Support umum), dan unduh log CSV.

---

## Admin panel

Login admin:

1. POST `/api/admin/auth/start-login` dengan username+password.
2. Backend menjawab `ticket`, lalu mengirim OTP 6-digit ke Telegram bot. Saat dev tanpa Telegram, OTP terlihat di console Wrangler.
3. POST `/api/admin/auth/verify-otp` dengan ticket + code → cookie sesi admin di-set.

Aksi sensitif (hapus user, reset password user, hapus order, refund, ubah saldo) memerlukan **konfirmasi password admin** terlebih dulu via `/api/admin/auth/confirm-password`. Endpoint mengembalikan `ack` token (TTL 5 menit) yang harus disertakan di body aksi sensitif. Token sekali pakai.

Fitur admin:

- Dashboard: omzet hari ini, order paid/pending/expired, user aktif, stok aktif, review menunggu, saldo masuk, refund hari ini, voucher aktif, chat butuh tindak lanjut, best seller hari ini.
- Produk: tambah/edit/hapus, kategori, harga, harga promo, durasi, harga grosir bertingkat, deskripsi (satu field, maks 2000 karakter, juga dipakai untuk pencarian), gambar (thumbnail + galeri maks 5, masing-masing ≤ 2 MB), status. Edit dikunci saat ada reservasi aktif. Tier harga & galeri ikut termuat saat edit sehingga tidak hilang saat disimpan ulang.
- Stok: paste/import TXT, lihat per item dengan pagination (50/halaman), hapus stok terpilih (hanya item `available`; reserved/sold aman). Statistik status dihitung server-side. Batas stok per produk via `MAX_STOCK_PER_PRODUCT`.
- Order: filter status, **buka detail order** (item, pembayaran, bukti transfer manual, akun terkirim), tandai paid manual, refund, hapus, bersihkan order >30 hari, export CSV.
- User: filter, nonaktifkan, aktifkan, hapus permanen / soft delete (lihat [Penghapusan user](#penghapusan-user)), reset password, sesuaikan saldo (dengan ack password admin).
- Voucher: CRUD penuh dengan kalender aktif.
- Review: moderasi approve/reject/spam/hapus.
- Support: list chat (support umum + refund) dengan **pencarian** (username / kode order) & **pagination**, balas, tutup, unduh log CSV. Admin tetap bisa membalas chat yang sudah ditutup.
- Pengaturan (sebelumnya "Maintenance"): toggle maintenance + pesan banner, biaya layanan, batas saldo maksimal user, **retensi chat** (24/48/72 jam), dan **retensi audit log** (30–365 hari).
- Audit log: filter by action.
- Laporan: download `/api/admin/dashboard/reports/transactions.csv`.

---

## Maintenance mode

- Toggle dari halaman Pengaturan (`/admin/maintenance`, di sidebar bernama **Pengaturan**).
- Saat aktif:
  - Banner kuning di seluruh halaman.
  - Endpoint `/api/checkout/*` mengembalikan 503 dengan kode `maintenance`.
  - Katalog tetap terbuka.
  - Admin tetap bisa login dan mengelola data.
- Pesan banner dapat diatur dari halaman maintenance.

---

## Penghapusan user

Tombol "Hapus" di halaman admin user memakai pendekatan **hybrid**: hard delete jika user belum pernah transaksi, soft delete (anonimisasi) jika sudah pernah. Tujuannya menjaga integritas riwayat order untuk audit dan laporan, tanpa menyimpan PII user yang sudah tidak aktif.

Aturan:

1. Saldo user harus 0 sebelum dihapus. Backend tolak dengan kode `balance_not_zero` dan menyebut nominal saldo tersisa. Admin harus refund / debit saldo (lewat menu Saldo) sampai 0 dulu.
2. Cek apakah user punya order:
   - **Tidak ada order** → `DELETE FROM users` (hard delete). Cascade FK akan ikut bersihkan cart, wallet_transactions, reviews, dan support_chats.
   - **Ada order minimal satu** → soft delete: `status='deleted'`, `username` & `email` di-anonimkan ke `deleted_<id>` & `deleted_<id>@local`, `display_name=NULL`, `password_hash=''` (login tidak mungkin), `session_version` dinaikkan agar sesi aktif invalid. Riwayat order tetap utuh.
3. UI dialog konfirmasi otomatis menjelaskan mode mana yang akan dijalankan ("hapus permanen" atau "anonimkan & hapus") sebelum admin klik konfirmasi.
4. Audit log mencatat dua action berbeda: `admin.user.delete.hard` dan `admin.user.delete.soft`.

Daftar user di admin UI menyembunyikan user `deleted` secara default. Filter `Dihapus` tersedia kalau perlu melihatnya untuk audit.

---

## Header keamanan & CSP

Semua response dari Worker mendapat header keamanan dasar:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `X-Request-Id` (UUID per request, untuk tracing)

Khusus untuk response HTML (halaman SPA), backend juga mengirim `Content-Security-Policy`:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob:;
connect-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
```

Catatan:

- `style-src 'unsafe-inline'` dibutuhkan oleh Tailwind v4 yang menyuntikkan style atribut runtime di sebagian komponen.
- QR pembayaran dirender sepenuhnya di sisi klien lewat library `qrcode` (canvas → data URL). Tidak ada lagi panggilan ke service QR pihak ketiga.
- CSP tidak diset pada response API (`/api/*`) atau static R2; hanya pada HTML.

---

## Logging

Helper `loggerFor(c)` dan `log` global di `src/worker/lib/log.ts` menulis log JSON terstruktur ke `console.*`. Field standar:

- `ts`, `level`, `msg`
- `request_id`, `user_id`, `admin_id`, `ip`, `path`, `method` (saat dipanggil dari handler)
- `event` (kunci kategori, mis. `webhook.pakasir.double_check_failed`)
- `err_name`, `err_message`, `err_stack` (stack di-trim 6 baris)

Log otomatis terlihat di `wrangler tail` dan bisa di-Logpush ke storage. Aturan: jangan log nilai sensitif. Field metadata cukup berisi ID atau counter, bukan password / token / payload pembayaran.

---

## Keamanan

- Validasi semua input dengan Zod (backend), tipe ketat di TS. Field teks utama (nama/deskripsi produk & kategori) menolak emoji; pesan error validasi dikembalikan spesifik per masalah.
- Backend selalu menghitung ulang harga, diskon, dan stok. Apapun dari client diabaikan.
- Sesi disimpan di KV. Saat user/admin login dari device lain, `session_version` naik dan sesi lama otomatis invalid.
- Frontend memantau sesi: setiap respons `401` sesi dan pengecekan berkala (tiap 3 menit) memunculkan popup "sesi berakhir" lalu mengarahkan user/admin ke halaman login, sehingga tidak ada aksi yang gagal diam-diam.
- Cookie sesi `HttpOnly`, `Secure` (saat `APP_ENV=production`), `SameSite=Lax`.
- Rate-limit via **Durable Object** (`RATE_LIMITER`): counter atomik & global per-key, tahan race saat request bersamaan. Dipakai untuk login user, login admin, OTP, register, top-up, upload, support send, dan konfirmasi password admin.
- Konfirmasi password admin diperlukan untuk aksi sensitif (token sekali pakai TTL 5 menit).
- Upload R2 dibatasi 2 MB dan tipe yang diizinkan (png, jpg, webp, gif). Tipe diverifikasi dari **isi file (magic bytes)**, bukan header dari client; folder tujuan dibatasi allow-list (folder produk hanya untuk admin).
- Path R2 yang sensitif (mis. bukti transfer manual di `proofs/`) dilindungi oleh `/api/files`: hanya admin atau user pemilik order yang berhak melihatnya. File publik (thumbnail & galeri produk) tetap bisa diakses tanpa login.
- Objek R2 dihapus otomatis (best-effort) agar tidak menumpuk: gambar produk saat produk diedit (gambar yang dibuang) atau dihapus, dan bukti transfer saat order dihapus atau di-cleanup.
- Tidak ada error verbose yang membocorkan info sensitif. Pesan error pakai bahasa alami dan tidak memancarkan kolom internal seperti `status_reason`.
- Reservasi, mark paid, dan debit saldo memakai pola CAS (compare-and-swap) di SQL.

---

## Logging & audit

Semua aksi penting dicatat ke `audit_logs`:

- Auth: register, login, logout, ganti password.
- Order: dibuat, paid, expired, refund, hapus.
- Admin: login start, login success, logout, perubahan produk/kategori/voucher/review/user/saldo, settings update.

Aturan retensi:

- Order final >30 hari dapat dihapus permanen via tombol admin.
- Chat (support umum & refund) yang sudah ditutup admin dihapus **total** oleh cron setelah `chat_retention_hours` (24/48/72 jam, default 24).
- Audit log otomatis di-prune oleh cron sesuai setting `audit_log_retention_days` (default **30 hari**, rentang **30–365**, diubah dari Admin Panel > Pengaturan). Prune selalu aktif (tidak bisa dinonaktifkan).

---

## Halaman yang tersedia

User:

- `/` Beranda
- `/katalog` Katalog dengan filter & sort
- `/p/:slug` Detail produk
- `/keranjang`
- `/login`, `/register`
- `/checkout`
- `/pembayaran/:idOrCode`
- `/sukses/:idOrCode`
- `/akun`, `/akun/support`, `/akun/pesanan`, `/akun/pesanan/:idOrCode`, `/akun/pesanan/:idOrCode/chat`, `/akun/pesanan/:idOrCode/invoice`

Admin:

- `/admin/login`
- `/admin` Dashboard
- `/admin/produk`, `/admin/kategori`, `/admin/stok/:productId`
- `/admin/order`, `/admin/order/:idOrCode` (detail order), `/admin/user`
- `/admin/voucher`, `/admin/review`, `/admin/support`
- `/admin/maintenance` (sidebar: **Pengaturan**), `/admin/audit`

---

## Troubleshooting

**OTP admin tidak masuk Telegram.**
Pastikan `TELEGRAM_BOT_TOKEN` valid dan `TELEGRAM_CHAT_ID` adalah chat ID milik admin (gunakan @userinfobot atau panggil `getUpdates` sekali setelah mengirim pesan ke bot). Saat dev, kode OTP juga tampil di console Wrangler.

**Saat upload stok muncul `parse_failed`.**
Cek detail error per baris yang dikembalikan di `details.errors`. Pastikan tiap baris minimal `email|password` dan tidak menggunakan pemisah lain.

**Order pending tidak otomatis expired.**
- Di production, cron `* * * * *` menjalankan handler `scheduled` setiap menit.
- Lokal Miniflare tidak auto-trigger cron (peringatan muncul di console). Order tetap di-self-heal setiap kali halaman order dibuka oleh user.

**`Internal Server Error` saat login pertama.**
Pastikan `SESSION_SECRET` di `.dev.vars` (lokal) atau secret (production) sudah ter-set dengan string panjang.

**Edit produk ditolak `locked`.**
Itu artinya masih ada reservasi aktif. Tunggu order pending expired atau cancel order tersebut.

**Custom theme/color Tailwind ada di mana?**
Tailwind v4 menggunakan deklarasi tema CSS-first lewat blok `@theme` di `src/client/styles.css`. Tidak ada `tailwind.config.js`. Class custom (`btn`, `card`, `chip`, dll.) dideklarasikan via `@utility` di file yang sama. Panduan lengkap token, komponen, dark mode, dan pola UI ada di [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

---

## Lisensi

Repository ini ditulis untuk keperluan internal. Bebas dipakai dan dimodifikasi sesuai kebutuhan tim.

## Dokumentasi tambahan

- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — sistem UI/UX "Aurora Noir": token, komponen, dark mode, pola, dan checklist pengembangan.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — keputusan desain detail per layer.
- [`docs/PAKASIR-INTEGRATION.md`](docs/PAKASIR-INTEGRATION.md) — referensi lengkap integrasi Pakasir (endpoint, webhook, sandbox).
