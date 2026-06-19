# Pasar Premium · Web Store Digital Item

Web store fullstack untuk menjual akun premium dan item digital lainnya, dibangun di atas Cloudflare Workers (Hono) + D1 + R2 + KV. Frontend React + Vite + Tailwind. Semua dalam satu repo, satu deployment, satu Worker.

> Backend adalah sumber kebenaran: harga, diskon, dan stok selalu dihitung ulang di server. Stok dijaga atomik untuk mencegah double-sell. QRIS via Pakasir; transfer bank manual & saldo internal ditangani sendiri.

**Dokumen pendamping:**
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — keputusan desain & detail teknis per layer (race condition, sesi, cron, rate limiter, dll).
- [`docs/PAKASIR-INTEGRATION.md`](docs/PAKASIR-INTEGRATION.md) — referensi lengkap integrasi Pakasir (endpoint, webhook, sandbox).
- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — sistem UI/UX "Aurora Noir" (token, komponen, dark mode).

## Daftar isi

1. [Highlight](#highlight)
2. [Stack & arsitektur](#stack--arsitektur)
3. [Pembagian penyimpanan](#pembagian-penyimpanan)
4. [Struktur folder](#struktur-folder)
5. [Setup pertama kali](#setup-pertama-kali)
6. [Variabel lingkungan](#variabel-lingkungan)
7. [Pengembangan lokal](#pengembangan-lokal)
8. [Migrasi & seed database](#migrasi--seed-database)
9. [Deployment](#deployment)
10. [Alur bisnis](#alur-bisnis)
11. [Sistem stok](#sistem-stok)
12. [Voucher & harga spesial](#voucher--harga-spesial)
13. [Saldo internal & refund](#saldo-internal--refund)
14. [Review & rating](#review--rating)
15. [Support chat & refund](#support-chat--refund)
16. [Admin panel](#admin-panel)
17. [Maintenance mode](#maintenance-mode)
18. [Penghapusan user](#penghapusan-user)
19. [Keamanan](#keamanan)
20. [Logging & audit](#logging--audit)
21. [Halaman yang tersedia](#halaman-yang-tersedia)
22. [Troubleshooting](#troubleshooting)

---

## Highlight

- ⚙️ Fullstack di satu Worker. React/Vite di-serve via Workers Assets, API Hono di `/api/*`.
- 🔒 Sesi user & admin di KV (HMAC), otomatis invalid saat login dari device lain.
- 🛡️ OTP admin via Telegram bot (rate-limit, expiry 5 menit, max 3 resend).
- 🧊 Reservasi stok atomik di D1 (UPDATE bersyarat + double-check) → bebas double-sell.
- 🚦 Rate-limit anti-spam via Durable Object (counter atomik & global).
- 🧾 Pembayaran QRIS (Pakasir, terintegrasi penuh — tanpa mock) / transfer bank manual / saldo internal.
- 📦 Stok "konten bebas": tiap item disimpan & dikirim apa adanya (akun, kode, link, teks), tanpa parsing.
- 🧠 Voucher fleksibel (persen/nominal, kuota total & per user, scope all/category/product), tidak tumpang dengan harga spesial.
- 💸 Saldo internal (top up QRIS, refund, adjustment), semua mutasi tercatat.
- 💬 Dua kanal chat: support umum (level akun) & refund (per order). Dibuat hanya saat dibutuhkan, dihapus total oleh cron setelah retensi.
- 🧹 Cron tiap menit: auto-expire order pending, hapus chat closed yang lewat retensi, prune audit log.
- 📱 UI premium "Aurora Noir" (aksen iris/violet; Space Grotesk + Inter + JetBrains Mono) dengan dark mode (ikut sistem) & microinteraction.
- 🕒 Semua waktu ditampilkan zona **Asia/Jakarta (WIB)**. Invoice memakai warna tetap (light) saat dicetak.

---

## Stack & arsitektur

| Layer | Teknologi | Catatan |
|------|-----------|---------|
| Edge runtime | Cloudflare Workers | Single fetch + scheduled handler |
| HTTP framework | Hono v4 | Rute API di `/api/*` |
| Bahasa | TypeScript 6 | Strict mode (worker & client) |
| Database | Cloudflare D1 (SQLite) | FK aktif, relasi ternormalisasi |
| Object storage | Cloudflare R2 | Gambar produk, bukti transfer |
| Key-Value | Cloudflare KV | Sesi, OTP, ack admin |
| Durable Object | `RATE_LIMITER` | Rate-limit atomik |
| Frontend | React 19 + React Router 7 | Lazy route, SPA fallback |
| Build tool | Vite 8 | Output `dist/client` |
| Styling | Tailwind CSS 4 | CSS-first via `@theme` (tanpa file config) |
| Validasi | Zod 4 | Semua input di-parse di backend |
| CLI | Wrangler 4 | Compatibility date 2026-06-01 |

```
┌─────────────────────────────┐         ┌─────────────────────────┐
│ React SPA (Vite static)     │         │ Cloudflare Workers      │
│ - katalog/keranjang/checkout│  ───►   │ - Hono API (/api/*)     │
│ - akun, payment, support    │   GET / │ - Auth middleware       │
└──────────────┬──────────────┘         │ - Cron auto-expire      │
               ▼                        │  ┌────┐ ┌────┐ ┌────┐    │
        ASSETS binding                  │  │ D1 │ │ KV │ │ R2 │    │
        (SPA fallback)                  │  └────┘ └────┘ └────┘    │
                                        └─────────────────────────┘
```

Lapisan: **Presentasi** (React) hanya render & kumpulkan input → **HTTP layer** (Hono: validasi Zod, middleware, mapping) → **Service layer** (seluruh aturan bisnis) → **Data** (D1/KV/R2). Detail keputusan desain di [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Pembagian penyimpanan

| Layanan | Dipakai untuk | Sifat |
|---|---|---|
| **D1** (SQL) | Data inti & transaksional: user, produk, stok, order, pembayaran, saldo, voucher, review, chat, audit, settings | Sumber kebenaran, permanen |
| **KV** | Sesi login user/admin, OTP admin, token konfirmasi (ack) admin | Sementara, ber-TTL |
| **Durable Object** (`RATE_LIMITER`) | Rate-limit: login, OTP, register, top-up, upload, cek-status, support | Counter atomik & global |
| **R2** | File biner: gambar produk, bukti transfer manual | Objek/blob |

> Rate-limit memakai Durable Object (bukan KV) agar atomik & global, sekaligus meringankan jatah tulis KV. Ini memindahkan beban ke layanan yang jatah gratisnya lebih longgar, bukan menghilangkan biaya.

---

## Struktur folder

```
digital-store-web-cf/
├─ migrations/      # SQL skema D1 (0001 … 0016)
├─ seeds/           # seed.sql (kategori+settings), seed-products.sql (demo), reset.sql (wipe)
├─ scripts/         # ensure-dist-client.mjs (pra-syarat wrangler dev)
├─ docs/            # ARCHITECTURE.md, DESIGN_SYSTEM.md, PAKASIR-INTEGRATION.md
├─ src/
│  ├─ shared/       # Tipe & konstanta lintas client+worker (types.ts, constants.ts, stock.ts)
│  ├─ client/       # Frontend React
│  │  ├─ main.tsx, App.tsx, index.html, styles.css (@theme + @utility)
│  │  ├─ components/  # AppShell, Button, ProductCard, Toast, Alert, ConfirmDialog, …
│  │  ├─ lib/         # api, format, hooks, theme, category-icons
│  │  ├─ pages/       # Halaman user
│  │  ├─ pages/admin/ # Halaman admin (+ admin-session.ts, AdminConfirm.tsx)
│  │  └─ state/       # AppProviders.tsx, RouteGuards.tsx
│  └─ worker/       # Backend Hono
│     ├─ index.ts     # Entry (fetch + scheduled); export RateLimiterDO
│     ├─ env.ts       # Tipe binding & context
│     ├─ middleware/  # auth, common (CSP/header), maintenance
│     ├─ lib/         # hash, session, rate-limit (+ rate-limiter-do), d1 (retry), audit, …
│     ├─ services/    # order, voucher, pricing, telegram, inventory-reserve, …
│     ├─ services/payment/  # Pakasir provider (QRIS only)
│     └─ routes/      # Rute API per modul (+ routes/admin/)
├─ wrangler.toml, vite.config.ts, tsconfig*.json, package.json
└─ .gitignore, .dev.vars.example, README.md
```

> Tidak di-commit (dibuat otomatis): `node_modules/`, `dist/`, `.wrangler/`, `.dev.vars`.
> Tailwind v4 CSS-first di `src/client/styles.css` — **tidak ada** `tailwind.config.js`/`postcss.config.js`.

---

## Setup pertama kali

Prasyarat: Node.js 20+, akun Cloudflare (free tier cukup), `npx wrangler login`.

```bash
npm install

# Buat resource Cloudflare (sekali saja), lalu salin id ke wrangler.toml:
npx wrangler d1 create digital_store            # → [[d1_databases]] database_id
npx wrangler kv namespace create digital_store_kv  # → [[kv_namespaces]] id
npx wrangler r2 bucket create digital-store-assets
```

Buat `.dev.vars` (salin dari `.dev.vars.example`) minimal berisi `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (lihat [Variabel lingkungan](#variabel-lingkungan)). Lalu:

```bash
npm run db:migrate:local
npm run db:seed:local
```

> `ADMIN_PASSWORD_HASH` di-treat sebagai password plain saat tabel `admins` masih kosong; sistem auto-hash & simpan ke DB pada login admin pertama. Setelahnya variabel ini tidak dipakai. Jangan pakai nilai mudah ditebak.

---

## Variabel lingkungan

| Variabel | Lokasi | Deskripsi |
|---------|--------|-----------|
| `APP_NAME` | `vars` | Nama tampilan aplikasi. |
| `APP_ENV` | `vars` | `development` atau `production` (mengatur cookie `Secure`). |
| `SESSION_TTL_SECONDS` | `vars` | TTL sesi (default 3600). |
| `ADMIN_OTP_TTL_SECONDS` | `vars` | TTL OTP admin (default 300). |
| `ADMIN_OTP_RESEND_COOLDOWN` | `vars` | Cooldown resend OTP (detik). |
| `ADMIN_OTP_MAX_RESENDS` | `vars` | Maks resend per ticket. |
| `PAYMENT_EXPIRY_SECONDS` | `vars` | Kedaluwarsa order pending (detik). |
| `MAX_STOCK_PER_PRODUCT` | `vars` | Batas stok hidup (available+reserved) per produk (default 1000). |
| `SESSION_SECRET` | secret | Kunci HMAC sesi. WAJIB, ≥ 32 karakter acak. |
| `ADMIN_USERNAME` | secret | Username admin awal (seed sekali). |
| `ADMIN_PASSWORD_HASH` | secret | Password plain pertama (auto-hash saat seed). |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | secret | Bot OTP admin. Opsional saat dev. |
| `PAKASIR_API_KEY` / `PAKASIR_PROJECT` | secret | Kredensial Pakasir. Wajib agar QRIS jalan. |

```bash
# Set secret di production:
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put PAKASIR_API_KEY
npx wrangler secret put PAKASIR_PROJECT
```

> Info rekening transfer manual TIDAK lewat env — diatur dari Admin Panel > Pengaturan.

---

## Pengembangan lokal

```bash
npm run dev   # Vite dev server + Wrangler dev (concurrently)
```

- Worker API + halaman build: http://127.0.0.1:8787
- Vite dev (HMR): http://127.0.0.1:5173 (proxy `/api` ke worker)

Tanpa `TELEGRAM_BOT_TOKEN`, kode OTP admin di-log ke konsol Wrangler.

---

## Migrasi & seed database

```bash
# lokal
npm run db:migrate:local
npm run db:seed:local
npm run db:seed-products:local   # opsional (produk demo)

# remote (Cloudflare)
npm run db:migrate:remote
npm run db:seed:remote
```

> **Reset total data (destruktif):** `wrangler d1 execute digital_store --remote --file=./seeds/reset.sql` lalu `--file=./seeds/seed.sql`. Admin ter-seed ulang otomatis saat login pertama.

Migrasi yang tersedia:

- `0001_initial` — skema utama (users, admins, categories, products, inventory, carts, orders, payments, wallet, vouchers, reviews, support, audit, settings).
- `0002_pakasir_fields` — kolom `display_amount_cents`, `fee_cents`, `expires_at_provider` di `payments`.
- `0003_manual_bank_settings` — default settings transfer bank manual.
- `0004` / `0005_*_perf_indexes` — index performa (FIFO reservasi, agregasi dashboard, audit, cleanup chat).
- `0006_cleanup_and_retention` — drop `payments.raw_response`, default `audit_log_retention_days`.
- `0007_unique_price_tier` — UNIQUE `product_price_tiers(product_id, min_qty)`.
- `0008_drop_product_badges` — hapus `products.badges` (label dihitung otomatis).
- `0009_max_wallet_balance` — default `max_wallet_balance_cents` (batas saldo user).
- `0010_drop_short_desc` — satukan deskripsi ke satu field `description` (maks 2000 char).
- `0011_chat_and_order_rework` — `orders.kind` (purchase/topup) + `refund_requested_at`; rebuild `support_chats` (order_id nullable + `kind`); setting retensi chat.
- `0012_drop_review_images` — hapus tabel `review_images` (review teks saja).
- `0013_drop_invalid_stock` — hapus status stok `invalid`.
- `0014_inventory_payload_content` — tambah kolom `payload_content` (transisi ke stok konten-bebas).
- `0015_inventory_content_only` — rebuild inventory jadi **konten-saja** (`payload_content NOT NULL`, buang kolom akun lama). Kompatibilitas stok lama dihapus.
- `0016_drop_review_spam_status` — hapus status review `spam` (digabung ke `rejected`); konversi baris lama `spam` → `rejected` (tidak mengubah agregat rating).

---

## Deployment

```bash
npm run build    # build client + typecheck worker
npm run deploy   # wrangler deploy
```

Catatan:

1. Pastikan `wrangler.toml` berisi `database_id` D1 & `id` KV asli.
2. **Migrasi skema D1 tidak ikut `wrangler deploy`.** Bila ada migrasi baru, jalankan `npm run db:migrate:remote` **sebelum** deploy agar kode baru tidak menabrak skema lama.
3. Binding Durable Object (`RATE_LIMITER`) & migration-nya ikut otomatis saat deploy.
4. Cron `* * * * *` men-trigger `scheduled` tiap menit (auto-expire & cleanup).
5. Static asset di-bundle dari `dist/client` lewat binding `ASSETS` (SPA fallback otomatis).

---

## Alur bisnis

**1. Browsing → keranjang.** Beranda menampilkan produk terbaru/populer/promo/ready. Katalog punya filter (kategori, range harga, ready stock) & sort. Detail produk menampilkan harga, label promo, stok, durasi, garansi, harga grosir, dan review approved (berpaginasi). Keranjang: qty via tombol +/- atau ketik langsung (di-commit saat blur/Enter, divalidasi ke stok tersedia).

**2. Checkout.** Wajib login. Backend memvalidasi ulang harga/stok/voucher, membuat order shell, lalu mereservasi stok atomik per produk (gagal → order dihapus + alasan jelas). Stok jadi `reserved` sampai bayar sukses atau expired. Catatan order opsional (maks 200 char).

**3. Pembayaran.** QRIS / transfer manual (upload bukti) / saldo. Halaman pembayaran: countdown 5 menit, auto-poll adaptif (30s→10s→5s), tombol cek manual (cooldown 10s UI + 4s server). Saat sukses → diarahkan ke `/sukses/<code>` yang menampilkan ringkasan (bukan konten akun).

**4. Pengiriman item.** Saat paid, reservasi di-commit ke `sold`. **Konten/data stok ditampilkan apa adanya** di detail pesanan (`/akun/pesanan/<code>`) dengan tombol salin & show/hide. Halaman sukses & invoice sengaja **tidak** memuat konten (keamanan). Cron melepas reservasi order yang tak dibayar.

**5. Setelah pembelian.** Menu Akun: profil, saldo, mutasi, daftar & detail order, invoice, bantuan, refund, review.

### Identitas user (username vs nama tampilan)

- **Username**: wajib, unik, untuk login; ditampilkan dengan prefix `@`.
- **Nama tampilan** (`display_name`): opsional, maks **30** karakter, tanpa `@`.
- Aturan: nama tampilan dipakai bila ada, jika kosong jatuh ke username. **Review publik tetap memakai `@username`** (tidak membocorkan nama asli). Saat user di-soft delete, `display_name` di-`NULL`-kan.

### Aturan registrasi akun

Dipusatkan di `src/shared/constants.ts` (validator dipakai client & worker; backend tetap sumber kebenaran).

- **Username**: 5–20 karakter, hanya huruf/angka/`_` (titik, plus, strip ditolak). Disimpan lowercase, unik.
- **Email**: format valid, hanya domain populer (`ALLOWED_EMAIL_DOMAINS`), tanpa `+`, maks 3 titik.
- **Nama tampilan**: opsional, maks 30 karakter.
- **Password**: 10–30 karakter; wajib huruf besar, kecil, angka, dan ≥1 simbol dari `@ ! # $ % & *` (karakter lain ditolak). Policy sama berlaku di registrasi, ganti password, dan reset password oleh admin.

---

## Sistem stok

Stok per produk = baris di `product_inventory_items`; tiap baris satu unit jual. **Tiap stok adalah satu blok konten bebas** yang disimpan & dikirim **apa adanya tanpa parsing** (akun, kode, link redeem, teks panjang), **maks 2000 karakter**.

Admin menambah stok via halaman Stok Produk, dua mode:

- **Satu stok** — satu kotak teks = satu stok (pas untuk data multi-baris).
- **Banyak stok** — banyak sekaligus, dipisah: **baris baru** (1 baris = 1 stok), **baris kosong**, atau **penanda khusus** (token, mis. `===STOK===`, untuk konten multi-baris). Pratinjau real-time menampilkan jumlah stok terdeteksi + peringatan sebelum disimpan.

Aturan:

- Konten ditampilkan ke pembeli sebagai teks (di-escape → aman XSS), dengan salin & show/hide.
- Stok hanya di kolom `payload_content` (NOT NULL sejak migrasi `0015`); tidak ada format akun lama.
- **Kuota total** stok hidup (available+reserved) per produk dijaga `MAX_STOCK_PER_PRODUCT` (default 1000); lewat batas → `stock_limit_exceeded`. `sold` tidak dihitung.
- **Batas teknis sekali input** = 1000 stok (`STOCK_BULK_MAX_ITEMS`), agar aman di limit D1. Penyimpanan via INSERT banyak-baris ber-chunk dalam satu batch.
- Logika pemecahan input ada di util bersama `src/shared/stock.ts` (`splitStockInput`), identik di client (pratinjau) & server (sumber kebenaran).
- Daftar stok berpaginasi (50/halaman); statistik dihitung server (`GROUP BY status`). Hanya item `available` yang bisa dihapus (reserved/sold aman).
- Saat ada reservasi aktif, edit produk dikunci (`locked`).

> Mekanisme anti double-sell (reservasi atomik) dijelaskan di [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#skema-race-condition).

---

## Voucher & harga spesial

Voucher di tabel `vouchers`, dievaluasi di `services/voucher.ts`:

- `discount_type`: `percent` (maks 100%) atau `amount`.
- `scope_type`: `all` / `category` / `product` (dua terakhir butuh `scope_ref_id`).
- Periode wajib valid (`active_until` > `active_from`). Kuota `total_quota` & `per_user_quota` dijaga atomik via `voucher_redemptions` UNIQUE `(voucher_id, order_id)`.
- **Tidak menumpuk dengan harga spesial**: item yang kena sale price / tier lebih murah tidak ikut subtotal yang eligible voucher. Hanya 1 voucher per order.

Harga tier (grosir) di `product_price_tiers`: `effectiveUnitPrice(qty)` memilih tier `min_qty <= qty` terbesar; jika tier > harga normal, harga normal menang. `min_qty` unik per produk (UNIQUE index, migrasi `0007`). Validasi dijaga backend & dicerminkan di form admin.

---

## Saldo internal & refund

- Saldo di `users.balance_cents` + tabel append-only `wallet_transactions` (audit trail, mencatat `balance_after_cents`).
- **Top-up**: order khusus `kind='topup'` lewat QRIS; setelah sukses kredit otomatis. Top up disembunyikan dari daftar pesanan & tidak bisa direfund.
- **Refund**: diajukan user di detail order, **sekali per order** (`refund_requested_at` ditandai, buka chat refund + pesan `[REFUND REQUEST]`). Admin bisa setujui (status → `refunded`, saldo dikredit, perlu ack password) atau kirim akun pengganti via chat.
- Aturan: tidak ada withdraw keluar; pemotongan saldo pakai CAS (`WHERE balance_cents >= ?`); batas saldo maks (`max_wallet_balance_cents`, default Rp1.000.000, `0`=tanpa batas) membatasi top up.

---

## Review & rating

- Hanya pembeli sukses pada order terkait yang boleh review (validasi join `orders` + `order_items`).
- **Teks saja** (UTF-8 + emoji, maks 500 char, karakter kontrol dibuang via `sanitizeText`). Tanpa foto.
- Default `pending`; hanya `approved` yang menghitung agregat rating (`rating_sum`/`rating_count`, di-update otomatis saat moderasi).
- Status moderasi: `pending` / `approved` / `rejected` (status `spam` dihapus — `reject` mewakili semua penolakan). `reject` dapat di-`approve` ulang. Menghapus review yang `approved` ikut mengurangi agregat rating (tidak menyisakan bintang "yatim").
- Tampil di detail produk via endpoint berpaginasi (`GET /products/:slug/reviews`, 5/halaman). Admin: Approve / Reject / Hapus (Reject bisa di-approve lagi; Hapus menyesuaikan agregat & membuka kesempatan user mereview ulang).

---

## Support chat & refund

Dua kanal pakai tabel sama (`support_chats.kind`):

1. **Support umum** — level akun (`/akun/support`), tidak terikat order. Satu chat aktif per user.
2. **Refund** — per order, dibuat otomatis saat user ajukan refund.

- Chat **hanya dibuat saat dibutuhkan** (bukan otomatis saat order paid).
- **Tutup**: admin set `closed`; user tak bisa membalas (lihat pesan sistem), admin masih bisa kirim. Cron menghapus **total** chat closed setelah `chat_retention_hours` (24/48/72 jam, default 24).
- Validasi: pesan maks 1000 char, alasan refund maks 500 char. Input: `Enter` kirim; `Shift/Ctrl/Cmd+Enter` baris baru.
- Admin: pencarian (username/kode order) + pagination, label jenis chat, unduh log CSV.

---

## Admin panel

**Login:** `start-login` (username+password) → OTP 6-digit ke Telegram → `verify-otp` (ticket+code) → cookie sesi admin. Aksi sensitif (hapus user, reset password, hapus order, refund, ubah saldo) butuh **konfirmasi password admin** via `confirm-password` → token `ack` sekali pakai (TTL 5 menit) yang disertakan di body aksi.

**Fitur:**

- **Dashboard**: omzet hari ini, order paid/pending/expired, user aktif, stok aktif, review menunggu, saldo masuk, refund, voucher aktif, chat butuh tindak lanjut, best seller.
- **Produk**: CRUD, kategori, harga + promo, durasi, tier grosir, deskripsi (maks 2000 char, dipakai pencarian), gambar (thumbnail + galeri maks 5, ≤2 MB). Edit dikunci saat ada reservasi.
- **Stok**: mode satu/banyak, pratinjau, pagination, hapus item available.
- **Order**: filter, detail (item, pembayaran, bukti transfer, konten terkirim), tandai paid manual, refund, hapus, bersihkan order >30 hari, export CSV.
- **User**: filter, nonaktifkan/aktifkan, hapus (lihat [Penghapusan user](#penghapusan-user)), reset password, sesuaikan saldo (ack password).
- **Voucher / Review / Support**: CRUD/moderasi/balas sesuai bagian terkait.
- **Pengaturan**: maintenance + pesan banner, biaya layanan, batas saldo, retensi chat (24/48/72 jam), retensi audit log (30–365 hari).
- **Audit log**: filter by action. **Laporan**: `GET /api/admin/dashboard/reports/transactions.csv`.

---

## Maintenance mode

Toggle dari Pengaturan (`/admin/maintenance`). Saat aktif: banner di semua halaman, `/api/checkout/*` → 503 `maintenance`, katalog tetap terbuka, admin tetap bisa kelola data.

---

## Penghapusan user

Pendekatan **hybrid** (menjaga integritas riwayat order tanpa menyimpan PII user nonaktif):

1. Saldo harus 0 (kalau tidak → `balance_not_zero`).
2. **Belum pernah order** → hard delete (`DELETE FROM users`, cascade FK).
3. **Pernah order** → soft delete: `status='deleted'`, `username`/`email` di-anonimkan, `display_name=NULL`, `password_hash=''`, `session_version` naik. Riwayat order utuh.

Dialog konfirmasi menjelaskan mode yang akan dijalankan. Audit mencatat `admin.user.delete.hard` vs `.soft`. User `deleted` disembunyikan default (ada filter `Dihapus`).

---

## Keamanan

- **Input**: semua divalidasi Zod di backend; field teks utama menolak emoji; pesan error spesifik tanpa membocorkan kolom internal (mis. `status_reason`).
- **Harga/stok**: backend selalu hitung ulang; apa pun dari client diabaikan.
- **Sesi**: di KV; login dari device lain menaikkan `session_version` → sesi lama invalid. Frontend memantau 401 + cek berkala (3 menit) lalu arahkan ke login. Cookie `HttpOnly`, `SameSite=Lax`, `Secure` saat production.
- **Rate-limit**: via Durable Object (`RATE_LIMITER`), atomik & global — login user/admin, OTP, register, top-up, upload, support, konfirmasi password admin.
- **Upload R2**: maks 2 MB; tipe diverifikasi dari **magic bytes** (bukan header client); folder dibatasi allow-list (folder produk admin-only). File sensitif (`proofs/`) hanya bisa diakses admin/pemilik order via `/api/files`. Objek R2 dibersihkan otomatis (best-effort) saat gambar/order dihapus.
- **Atomicity**: reservasi, mark paid, dan debit saldo memakai pola CAS (compare-and-swap) di SQL.
- **Header keamanan** (semua response): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `X-Request-Id`.
- **CSP** (khusus HTML SPA):

  ```
  default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:;
  connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';
  ```

  `'unsafe-inline'` pada style dibutuhkan Tailwind v4 (style atribut runtime). QR dirender di klien (library `qrcode`), tanpa service pihak ketiga.

---

## Logging & audit

**Logging terstruktur** — `loggerFor(c)` & `log` global (`src/worker/lib/log.ts`) menulis JSON satu baris ke `console.*` (field `ts`, `level`, `msg`, `event`, `request_id`, `user_id`/`admin_id`, `ip`, `path`, `method`, `err_*`). Terlihat di `wrangler tail` & Logpush. **Jangan log nilai sensitif.**

**Penanganan error** — `app.onError` global: error D1 **transien** → **503** `service_busy` (retryable), lainnya **500** `internal`; tidak ada "Internal Server Error" telanjang. Operasi baca kritis di-retry otomatis (`withD1Retry`, `lib/d1.ts`). Detail di [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#penanganan-error--ketahanan-d1).

**Audit** — aksi penting dicatat ke `audit_logs` (auth, order lifecycle, perubahan admin). Retensi:

- Order final >30 hari bisa dihapus admin.
- Chat closed dihapus total oleh cron setelah `chat_retention_hours`.
- Audit log di-prune cron sesuai `audit_log_retention_days` (default 30, rentang 30–365; selalu aktif).

---

## Halaman yang tersedia

**User:** `/` · `/katalog` · `/p/:slug` · `/keranjang` · `/login` · `/register` · `/checkout` · `/pembayaran/:idOrCode` · `/sukses/:idOrCode` · `/akun` (+ `/support`, `/pesanan`, `/pesanan/:idOrCode`, `/pesanan/:idOrCode/chat`, `/pesanan/:idOrCode/invoice`).

**Admin:** `/admin/login` · `/admin` (dashboard) · `/admin/produk` · `/admin/kategori` · `/admin/stok/:productId` · `/admin/order` (+ `/:idOrCode`) · `/admin/user` · `/admin/voucher` · `/admin/review` · `/admin/support` · `/admin/maintenance` (sidebar: Pengaturan) · `/admin/audit`.

---

## Troubleshooting

**OTP admin tidak masuk Telegram.** Pastikan `TELEGRAM_BOT_TOKEN` valid & `TELEGRAM_CHAT_ID` benar (pakai @userinfobot). Saat dev, OTP juga tampil di konsol Wrangler.

**Gagal menambah stok.** `item_too_long` = ada stok >2000 karakter; `too_many_items` = >1000 stok sekali input (bagi beberapa kali); `stock_limit_exceeded` = lewat kuota produk (`MAX_STOCK_PER_PRODUCT`). Pratinjau mode "Banyak stok" menampilkan peringatan sebelum submit.

**Login sesekali balas `503` "sistem sibuk".** Error D1 transien yang sudah ditangani (di-retry; kalau masih gagal → 503 retryable, bukan 500). Wajar sesekali. Cek `npx wrangler tail` (event `request.transient_error`); kalau sering, pertimbangkan naikkan retry di `lib/d1.ts`.

**Order pending tidak auto-expired.** Production: cron tiap menit. Lokal Miniflare tidak auto-trigger cron, tapi order di-self-heal saat halaman order dibuka.

**`Internal Server Error` saat login pertama.** Pastikan `SESSION_SECRET` sudah di-set (string panjang).

**Edit produk ditolak `locked`.** Masih ada reservasi aktif — tunggu order pending expired / cancel.

**Cari custom theme/warna.** Tailwind v4 CSS-first di blok `@theme` pada `src/client/styles.css` (tanpa `tailwind.config.js`). Panduan lengkap: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

---

## Lisensi

Repository internal. Bebas dipakai dan dimodifikasi sesuai kebutuhan tim.
