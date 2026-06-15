# Arsitektur Sistem

Dokumen ini melengkapi `README.md` dengan detail arsitektur dan keputusan desain. Tujuannya menjawab pertanyaan "kenapa begini" untuk pengembang yang akan melanjutkan proyek.

## Lapisan & tanggung jawab

```
┌─────────────────────────────────────────────────────────────┐
│ Presentation (React, Tailwind)                              │
│ - render data, kumpulkan input, format tampilan             │
│ - tidak melakukan validasi bisnis maupun perhitungan harga  │
└──────────────┬──────────────────────────────────────────────┘
               │ HTTP /api/*
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Edge HTTP layer (Hono di Workers)                           │
│ - parsing body via Zod                                      │
│ - middleware auth/maintenance/rate-limit                    │
│ - mapping ke service                                        │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Service layer                                               │
│ - order, payment, pricing, voucher, inventory, telegram     │
│ - berisi seluruh aturan bisnis                              │
│ - tidak peduli framework HTTP                                │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌────────────┬───────────┬────────────────────────────────────┐
│ D1 (SQL)   │ KV         │ R2                                  │
│ truth data │ session    │ aset (gambar)                       │
│ orders,    │ otp        │                                     │
│ inventory  │ ack token  │                                     │
└────────────┴────────────┴─────────────────────────────────────┘
```

Aturan ketat:

- Frontend tidak pernah mengirim harga, total, diskon. Backend menghitung ulang dari ID produk + qty + voucher code.
- Service layer adalah satu-satunya tempat aturan bisnis. Route hanya menerima input, validasi schema, panggil service, dan format response.
- D1 menjadi single source of truth untuk data transaksional. KV hanya untuk hal yang boleh hilang (sesi, OTP, ack token). Rate limit dipindah ke Durable Object agar atomik & global.

> **Lapisan presentasi (UI/UX).** Detail sistem desain frontend — token `@theme`,
> komponen primitif, dark mode, pola notifikasi (Alert vs Toast), dan checklist
> pengembangan — didokumentasikan terpisah di [`docs/DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).
> Backend/arsitektur (dokumen ini) dan presentasi sengaja dipisah agar masing-masing
> mudah dikembangkan tanpa saling mengganggu.

## Flow checkout end-to-end

```
[Browser]                     [Worker]                                 [D1]
   |                             |                                       |
   |   POST /checkout            |                                       |
   |---------------------------->|                                       |
   |                             |  load cart_items (FOR cart user)      |
   |                             |--------------------------------------►|
   |                             |  load price_context per produk        |
   |                             |--------------------------------------►|
   |                             |  hitung subtotal, voucher, fee, total |
   |                             |  insert orders                        |
   |                             |  insert order_items                   |
   |                             |  for each product:                    |
   |                             |    UPDATE inventory_items             |
   |                             |      SET status='reserved'            |
   |                             |      WHERE status='available' LIMIT n |
   |                             |    SELECT count reserved untuk order  |
   |                             |    if < n -> rollback semua reservasi |
   |                             |    untuk order ini, hapus order       |
   |                             |  insert payments                      |
   |                             |  delete cart_items                    |
   |                             |  return order_code                    |
   |<----------------------------|                                       |
   |   GET /orders/:code (poll)  |                                       |
   |---------------------------->|                                       |
   |                             |  expireOrderIfDue                     |
   |                             |  jika provider success:               |
   |                             |    UPDATE orders status='paid'        |
   |                             |    WHERE status='pending_payment'     |
   |                             |    commit reservation -> 'sold'       |
   |                             |    increment products.sales_count     |
   |                             |    insert voucher_redemption (idemp.) |
   |                             |    open support_chat (idemp.)         |
```

## Skema race condition

Reservasi atomik di SQLite/D1 didapat dari kombinasi:

1. Setiap statement D1 atomik dan diserialisasi pada level baris.
2. UPDATE memilih kandidat via subselect, ditambah klausul `AND status='available'` di klausul WHERE utama untuk double-check.
3. Setelah UPDATE, kita _membaca ulang_ jumlah baris yang benar-benar terikat pada `order_id` ini. Jika kurang dari permintaan, kita melepas baris yang sempat terkunci untuk order ini dan menggagalkan order.

Skenario uji manual yang membuktikan tidak ada double-sell:

- Buat produk dengan stok = 1.
- Dua user mengirim `POST /checkout` paralel.
- Salah satu mendapat 200 OK dengan `orderCode`.
- Yang lain mendapat 409 dengan `code: stock_unavailable`.
- Inventory akhir: 1 baris di status `reserved`, 0 baris `available`.

`markOrderPaid` aman dari race karena memakai `UPDATE ... WHERE status='pending_payment'` dan menentukan kemenangan pada `meta.changes`. Pemanggilan ganda menjadi no-op dengan return `{ alreadyPaid: true }`.

## Sesi & autentikasi

- Session token = `base64url(payload).hmacSha256(secret, body)` dengan payload `{ k, sid, uid, v, iat, exp }`.
- Stored session di KV menjadi single source of truth → revoke dengan menghapus key.
- `session_version` di tabel `users`/`admins` di-increment saat login baru, ganti password, atau reset password admin. Saat verifikasi sesi, kita reject jika `payload.v !== row.session_version`. Efeknya: device lama otomatis logout.
- Cookie `Secure` aktif saat `APP_ENV=production`. Saat dev (HTTP), `Secure` dimatikan agar testing lokal tetap bekerja.

## OTP admin via Telegram

- Saat `start-login`, server menghasilkan 6 digit OTP dan menyimpan ke KV dengan TTL `ADMIN_OTP_TTL_SECONDS`.
- Pengiriman via `https://api.telegram.org/bot<token>/sendMessage`.
- Resend dibatasi: cooldown `ADMIN_OTP_RESEND_COOLDOWN`, maksimal `ADMIN_OTP_MAX_RESENDS` per ticket.
- Verifikasi OTP membatalkan ticket dan menerbitkan sesi admin baru. Token ack untuk aksi sensitif diterbitkan oleh `confirm-password` (sekali pakai, TTL 5 menit).

## Inventory parser

Parser di `services/inventory-parser.ts` mendukung:

- Pemisah `|`.
- Field minimal: `email|password`.
- Tambahan: `note`, `expiry`, dan _extras_ (apa pun setelah expiry digabung kembali dengan `|`).
- Whitespace di-trim per field.
- Baris kosong dan diawali `#` diabaikan sebagai komentar.

Parser mengembalikan `errors[]` yang menunjukkan baris bermasalah; UI admin menampilkan error tersebut.

## Provider abstraction

`PaymentProvider` interface: `create(input)` dan `check(externalId, orderCode)`.

- `PakasirPaymentProvider` adalah satu-satunya implementasi. Hanya menangani QRIS.
- `pakasirProvider(env)` mengembalikan instance siap pakai. Throw `PaymentConfigError` bila `PAKASIR_API_KEY` atau `PAKASIR_PROJECT` belum di-set; tidak ada fallback mock.

Polling status:

- Frontend memanggil `POST /orders/:idOrCode/check-status` (rate-limited 1 hit / 4s server-side; UI cooldown 10s).
- Server memanggil `provider.check()` dan, jika sukses, `markOrderPaid()`.
- Setiap percobaan dicatat ke `payment_attempts`.

## Maintenance mode

Toggle `app_settings.maintenance_mode = '1'`. Middleware `blockOnMaintenance` di-mount khusus di `/api/checkout`. Endpoint lain tetap aktif.

## Cron

`scheduled` handler di `worker/index.ts` di-trigger oleh cron `* * * * *`:

- Memanggil `expireAllDueOrders` untuk mengeluarkan order pending yang sudah lewat waktu, melepas reservasi, dan men-set payment expired.
- Menghapus **total** (baris chat + seluruh pesan) `support_chats` yang sudah `closed` dan melewati masa retensi. Retensi dibaca dinamis dari `app_settings.chat_retention_hours` (sah 24/48/72, default 24); cutoff dihitung `closed_at + retensi`, sehingga perubahan setting langsung berdampak ke chat closed yang ada.
- Prune `audit_logs` yang lebih tua dari `app_settings.audit_log_retention_days`. Rentang sah 30–365 hari (default 30); nilai di luar rentang di-clamp. Prune **selalu** jalan (tidak ada opsi nonaktif), dibatasi 1.000 baris per tick agar tidak meledakkan D1 sekaligus.

Saat dev (Miniflare), cron tidak otomatis. UI tetap self-heal: setiap kali list/detail order pending dibuka, `expireOrderIfDue` dipanggil.

## Support chat & refund lifecycle

Ada dua kanal chat yang memakai tabel yang sama (`support_chats.kind`):

- **`support`** — chat support umum di level akun (`order_id` NULL). Satu chat aktif per user, dibuat saat user mengirim pesan pertama dari halaman Bantuan.
- **`refund`** — chat per order (`order_id` terisi, unik per order). Dibuat saat user menekan "Ajukan refund" di detail pesanan.

Keputusan desain penting:

- **Tidak ada auto-create saat order paid.** Ruang chat hanya dibuat saat benar-benar dibutuhkan, mengurangi data mati dan beban triase admin.
- **Refund sekali per order.** `orders.refund_requested_at` ditandai saat pengajuan pertama dan tidak pernah direset. Aturan "sekali per order" tetap berlaku meskipun chat refund-nya sudah dihapus total oleh cron (mencegah pengajuan berulang setelah ditolak).
- **Tutup chat tidak langsung menghapus.** Saat admin menutup, status jadi `closed`, `closed_at` diisi, satu pesan sistem ditambahkan, dan user tidak bisa membalas lagi. Admin **masih bisa** mengirim ke chat closed (catatan akhir / akun pengganti). Penghapusan total dilakukan cron setelah `chat_retention_hours`.
- **`order_id` nullable.** Kolom dibuat nullable lewat rebuild tabel (migrasi 0011) supaya chat support umum bisa disimpan tanpa order. Unique index parsial `WHERE order_id IS NOT NULL` menjaga 1 chat refund per order tanpa mengganggu banyak baris support (`order_id` NULL).
- **Validasi pesan** dipusatkan di `sanitizeChatBody` (`lib/validation.ts`): buang karakter kontrol (kecuali newline/tab), izinkan UTF-8 + emoji, potong ke maks 1000 karakter. Alasan refund maks 500 karakter.

## Wallet (debit & credit)

`debitWallet` dan `creditWallet` di `services/order.ts` memakai `UPDATE ... RETURNING balance_cents` (D1/SQLite 3.35+) sehingga `balance_after_cents` yang dicatat di `wallet_transactions` benar-benar sinkron dengan baris yang baru saja dimutasi. Tidak ada celah race antara UPDATE dan SELECT terpisah seperti pola lama.

Debit tetap atomik via klausul `WHERE balance_cents >= ?` (CAS). Saldo user tidak pernah bisa minus.

## Audit log

Setiap aksi penting dicatat ke `audit_logs` lewat helper `audit()`. Tabel ini append-only dan menjadi sumber halaman `/admin/audit`. Cron melakukan prune sesuai setting retensi (default 365 hari).

## Penghapusan user (hybrid)

Tombol hapus user di admin tidak melakukan `DELETE FROM users` tanpa cek. Skema FK sengaja `ON DELETE RESTRICT` untuk `orders.user_id` agar riwayat penjualan tetap utuh. Backend menerapkan strategi:

- Jika user belum pernah punya order, lakukan hard delete. Cascade FK ke tabel anak akan ikut membersihkan.
- Jika user sudah pernah transaksi, lakukan soft delete: anonimkan PII (`username`/`email` jadi `deleted_<id>`), kosongkan `password_hash`, set `status='deleted'`, naikkan `session_version`.
- Saldo wajib 0 sebelum hapus, agar tidak ada uang user yang "hilang".

Audit log mencatat dua action berbeda (`admin.user.delete.hard` vs `admin.user.delete.soft`) untuk traceability.

## Pagination admin list

Helper `parsePagination` di `lib/pagination.ts` membaca `?page=&page_size=` dengan default 50, max 200, dan mengembalikan `{ page, pageSize, offset }`. Response standar `{ items, page, pageSize, total }` dipakai oleh `/admin/orders`, `/admin/users`, `/admin/dashboard/audit`, `/admin/support`, `/admin/reviews`, dan `/account/wallet/transactions` (mutasi saldo user, 20 per halaman). Admin UI & halaman Akun memakai komponen `Pagination` ringan untuk navigasi.

Untuk admin list yang biasanya kecil (kategori, voucher), pagination belum diterapkan agar UX tetap simpel. Kalau dataset bertumbuh, pola yang sama bisa di-port ke list itu.

## Logging terstruktur

`loggerFor(c)` di `lib/log.ts` membungkus konteks request (`requestId`, `userId`, `adminId`, `path`, `method`, `ip`) dan menulis JSON satu baris ke `console.*`. `log` global dipakai di `scheduled` handler dan tempat tanpa `Context`. Tidak dependen pada library eksternal, dan langsung kompatibel dengan `wrangler tail` & Logpush.

## Skema penyimpanan KV

- `sess:<kind>:<sid>` → JSON sesi (TTL = TTL sesi).
- `active_sess:user:<uid>` / `active_sess:admin:<uid>` → sid aktif terbaru.
- `admin_otp:<ticket>` → state OTP login admin.
- `admin_ack:<adminId>:<token>` → token konfirmasi password admin.

> Rate limit **tidak** lagi di KV. Sekarang ditangani Durable Object `RATE_LIMITER`
> (lihat bagian "Rate limiting" di bawah).

## Rate limiting (Durable Object)

`lib/rate-limit.ts` membungkus pemanggilan ke Durable Object `RATE_LIMITER`
(`lib/rate-limiter-do.ts`). Tiap key (mis. `rl:login:ip:<ip>`) dipetakan ke satu
instance DO via `idFromName(key)`. Karena DO single-threaded & konsisten global,
counter per-key bersifat atomik — bebas dari race read-modify-write yang mungkin
terjadi di KV (eventually consistent). Parameter `windowSeconds` & `max` dikirim
per-request, sehingga satu kelas melayani semua area (jendela 4s/60s/300s, dst).

Counter disimpan in-memory: DO hidup selama key aktif diakses (akurat saat
brute-force berlangsung); bila menganggur lama lalu di-evict, window memang sudah
lewat. Jika DO tidak tersedia, `rateLimit()` fail-open (melewatkan limit sesaat &
mencatat log) agar tidak memblokir total layanan. Binding & migrasi diatur di
`wrangler.toml` (`new_sqlite_classes` agar jalan di Workers Free plan).
