# Integrasi Pakasir

> Dokumentasi resmi Pakasir: https://pakasir.com/p/docs (diperbarui 22 May 2026).
> Dokumen ini menjelaskan integrasi yang **sudah terpasang penuh** di repo ini.

## Ringkasan

Aplikasi ini menggunakan **Pakasir QRIS sebagai satu-satunya payment gateway**. Tidak ada VA via Pakasir, tidak ada provider lain, dan tidak ada mode mock. Pilihan metode pembayaran yang tampil ke user adalah:

| Metode | Provider | Catatan |
|--------|----------|---------|
| **QRIS** | Pakasir | WAJIB. QRIS-only, hard-coded. |
| **Transfer Bank Manual** | Internal (verifikasi admin) | OPSIONAL. Diaktifkan dari Admin Panel > Pengaturan Sistem. |
| **Saldo internal** | Internal | Selalu tersedia. |

Persyaratan minimal agar QRIS jalan:

- `PAKASIR_API_KEY` dan `PAKASIR_PROJECT` di-set sebagai secret Worker.
- Kalau salah satu kosong, endpoint `/api/checkout` dengan `paymentMethod: "qris"` akan mengembalikan error `pakasir_not_configured` dan order tidak terbentuk (reservasi stok di-rollback).

---

## A. Persiapan akun Pakasir

1. Daftar/login di https://app.pakasir.com.
2. Buat **Proyek**. Catat **Slug** dan **API Key** dari halaman detail proyek.
3. (Opsional, direkomendasikan) Set **Webhook URL** di proyek ke `https://<domain-anda>/api/webhooks/pakasir`.
4. Set secret di Cloudflare Worker:

```bash
npx wrangler secret put PAKASIR_API_KEY
npx wrangler secret put PAKASIR_PROJECT
```

Atau di lokal, tulis di `.dev.vars`:

```env
PAKASIR_API_KEY=ganti-dengan-api-key-asli-dari-dashboard-pakasir
PAKASIR_PROJECT=ganti-dengan-slug-proyek
```

> Jangan pernah commit nilai asli `PAKASIR_API_KEY` ke repo. File `.dev.vars` dan `.env*` sudah masuk `.gitignore`.

---

## B. Endpoint Pakasir yang dipakai

### B.1. `POST /api/transactioncreate/qris`

Membuat transaksi QRIS baru. Dipanggil saat user submit checkout dengan metode QRIS.

**URL**: `https://app.pakasir.com/api/transactioncreate/qris`

**Body request (JSON)**:

```json
{
  "project": "<slug-proyek>",
  "order_id": "ORD-AGDBY53N",
  "amount": 25000,
  "api_key": "<api-key>"
}
```

| Field | Tipe | Deskripsi |
|-------|------|-----------|
| `project` | string | Slug proyek Pakasir. |
| `order_id` | string | ID transaksi dari sistem kita. Sistem ini menggunakan `orders.code` (mis. `ORD-A1B2C3D4`). |
| `amount` | int | Nominal yang diterima merchant, dalam rupiah penuh tanpa titik. |
| `api_key` | string | API key proyek. |

**Response sukses**:

```json
{
  "payment": {
    "project": "<slug-proyek>",
    "order_id": "ORD-AGDBY53N",
    "amount": 25000,
    "fee": 485,
    "total_payment": 25485,
    "payment_method": "qris",
    "payment_number": "00020101021226610016ID.CO.SHOPEE.WWW...",
    "expired_at": "2025-09-19T01:18:49.678622564Z"
  }
}
```

| Field | Deskripsi |
|-------|-----------|
| `amount` | Nominal yang merchant terima (sama dengan request). |
| `fee` | Biaya gateway. |
| `total_payment` | Jumlah total yang user bayar (`amount + fee`). **Ini yang kita tampilkan ke user.** |
| `payment_method` | Selalu `qris`. |
| `payment_number` | **QR string EMV**. Frontend mengubahnya menjadi gambar QR di sisi klien lewat library `qrcode` (canvas → data URL). Tidak ada panggilan ke service QR pihak ketiga. |
| `expired_at` | Waktu expired ISO-8601 dari sisi Pakasir. |

**Error handling**:

- HTTP non-2xx atau body tanpa field `payment` → `OrderError` dengan code `payment_provider_failed`. Reservasi stok di-rollback dan order dihapus.
- Konfigurasi belum lengkap → `OrderError` dengan code `pakasir_not_configured`.

### B.2. `GET /api/transactiondetail`

Cek status sebuah transaksi. Dipanggil saat polling status (auto-poll halaman pembayaran atau tombol manual).

**URL**: `https://app.pakasir.com/api/transactiondetail`

**Query params**:

```
project=<slug-proyek>
amount=25000
order_id=ORD-AGDBY53N
api_key=<api-key>
```

> `amount` harus **persis sama** dengan saat `transactioncreate`, bukan `total_payment`.

**Response**:

```json
{
  "transaction": {
    "amount": 25000,
    "order_id": "ORD-AGDBY53N",
    "project": "<slug-proyek>",
    "status": "completed",
    "payment_method": "qris",
    "completed_at": "2024-09-10T08:07:02.819+07:00"
  }
}
```

| `status` Pakasir | Mapping internal |
|------------------|------------------|
| `completed`, `success`, `paid` | `success` → trigger `markOrderPaid()` |
| `expired` | `expired` → trigger `expireOrderIfDue()` |
| `failed`, `cancelled`, `canceled` | `failed` |
| lainnya | `pending` |

### B.3. `POST /api/paymentsimulation` (sandbox)

Simulasikan pembayaran sukses untuk testing. Hanya bekerja saat proyek dalam **mode sandbox**.

**URL**: `https://app.pakasir.com/api/paymentsimulation`

**Body**:

```json
{
  "project": "<slug-proyek>",
  "order_id": "ORD-AGDBY53N",
  "amount": 25000,
  "api_key": "<api-key>"
}
```

**Response**:

```json
{ "success": true }
```

Setelah simulasi, status di Pakasir akan menjadi `completed` dan webhook akan terkirim (jika webhook URL di-set). Polling status akan mengembalikan `completed`.

Di sistem ini, endpoint dev `POST /api/orders/:code/simulate-paid` (hanya jalan saat `APP_ENV !== "production"`) akan otomatis memanggil `paymentsimulation` ini lalu polling status.

### B.4. `POST /api/transactioncancel`

Membatalkan transaksi yang masih pending di Pakasir.

**URL**: `https://app.pakasir.com/api/transactioncancel`

**Body**: Sama seperti `paymentsimulation`.

Sistem ini menyediakan helper `provider.cancel(orderCode, amount)` di kelas `PakasirPaymentProvider`. Belum di-expose ke route public, tapi siap dipanggil bila perlu (mis. saat user batalkan order secara aktif).

### B.5. Webhook Pakasir → Worker

Pakasir akan POST ke webhook URL kita saat dana masuk. Body:

```json
{
  "amount": 25000,
  "order_id": "ORD-AGDBY53N",
  "project": "<slug-proyek>",
  "status": "completed",
  "payment_method": "qris",
  "completed_at": "2024-09-10T08:07:02.819+07:00"
}
```

Endpoint kita: `POST /api/webhooks/pakasir`. Lihat bagian **D** untuk detail validasi.

---

## C. Alur lengkap dalam sistem ini

### C.1. Saat user submit checkout QRIS

```
[User klik "Buat order" dengan metode QRIS]
        │
        ▼
[Worker /api/checkout]
   1. validasi cart
   2. hitung subtotal/diskon/voucher (backend = sumber kebenaran)
   3. cek maintenance mode
   4. INSERT order shell (status=pending_payment)
   5. INSERT order_items
   6. reservasi stok atomik per produk
        - kalau gagal → rollback semua, hapus order
   7. POST ke Pakasir /api/transactioncreate/qris
        - kalau gagal (HTTP/network/config) → rollback reservasi + hapus order
   8. simpan ke payments:
        - amount_cents          = total order
        - display_amount_cents  = total_payment dari Pakasir (yang user bayar)
        - fee_cents             = fee dari Pakasir
        - external_id           = order_id (sama dengan code kita)
        - qr_payload            = payment_number (QR string)
        - expires_at_provider   = expired_at dari Pakasir
   9. clear cart_items
  10. kembalikan { orderId, orderCode } ke frontend
        │
        ▼
[Frontend redirect ke /pembayaran/<orderCode>]
```

### C.2. Saat user di halaman pembayaran

```
[Frontend /pembayaran/<orderCode>]
   - render QR dari payment_number lewat library `qrcode` (canvas data URL)
   - countdown 5 menit (PAYMENT_EXPIRY_SECONDS)
   - tampilkan: total_payment + breakdown fee
   - auto-poll adaptif:
        > 60s tersisa  : tiap 30s
        20-60s tersisa : tiap 10s
        ≤ 20s tersisa  : tiap 5s
   - tombol manual cek dengan cooldown 10s, disabled saat ≤15s tersisa
```

Setiap polling memanggil `POST /api/orders/:code/check-status`:

```
[Worker check-status]
   1. self-heal expiry: kalau order pending lewat waktu → set expired
   2. kalau status pending_payment & method=qris:
        a. ambil payment row
        b. panggil Pakasir /api/transactiondetail
        c. catat ke payment_attempts
        d. kalau status=success → markOrderPaid()
        e. kalau status=expired → expireOrderIfDue()
   3. return order detail
```

### C.3. `markOrderPaid()` (atomik & idempotent)

```
1. UPDATE orders SET status='paid', paid_at=? WHERE id=? AND status='pending_payment'
   - kalau changes=0 dan status sudah 'paid' → return { alreadyPaid: true }
   - kalau changes=0 dan status lain → invalid_state error
2. (kalau wallet) debit saldo user
3. commit reservasi: UPDATE inventory SET status='sold' untuk order ini
4. tambah products.sales_count
5. UPDATE payments SET status='success'
6. reservasi voucher (kuota & redemption) sudah dikunci saat checkout — di sini
   cukup dibiarkan menjadi permanen
7. (chat support TIDAK dibuat otomatis; hanya dibuat saat user mengajukan
   refund / membuka Bantuan)
8. audit log
```

Race condition aman karena `UPDATE ... WHERE status='pending_payment'` adalah operasi atomik di SQLite/D1.

### C.4. Webhook (jalur paralel, opsional)

Kalau webhook URL di-set di dashboard Pakasir, saat dana masuk Pakasir akan POST ke `/api/webhooks/pakasir`. Lihat bagian **D**.

---

## D. Webhook handler

Endpoint: `POST /api/webhooks/pakasir` (public, tidak butuh auth user/admin).

### D.1. Validasi yang dilakukan

1. **Body JSON valid** → kalau tidak, 400 `invalid_json`.
2. **Field lengkap**: `order_id`, `amount`, `project` → kalau tidak, 400 `missing_fields`.
3. **Project match** dengan `PAKASIR_PROJECT` → kalau tidak, 400 `project_mismatch`.
4. **Order ada** di tabel `orders` → kalau tidak, 404 `order_not_found`.
5. **Amount match** dengan `orders.total_cents` → kalau tidak, 400 `amount_mismatch`.
6. **Double-check** ke `GET /api/transactiondetail` → status di Pakasir harus benar-benar `completed/paid/success`. Kalau tidak, 400 `double_check_failed`. Kalau jaringan ke Pakasir gagal, 502 `double_check_unreachable`.
7. **Idempoten**: `markOrderPaid` aman dipanggil ganda. Kalau order sudah paid, no-op.

### D.2. Apakah webhook wajib?

**Tidak wajib.** Sistem punya dua jalur:

- **Polling** (selalu aktif): client memicu `check-status` saat user di halaman pembayaran.
- **Webhook** (opsional): mempercepat update status saat user sudah tutup tab.

Polling sudah cukup untuk operasional normal. Webhook adalah peningkatan UX. Kalau webhook URL kosong di dashboard Pakasir, endpoint tetap aman karena validasi anti-spoof tetap aktif.

### D.3. Diagram

```
[User bayar QRIS]
   │
   ▼
[Pakasir terima dana]
   │
   ├──► [Webhook: POST /api/webhooks/pakasir]
   │      - validasi project + amount + order_id
   │      - DOUBLE-CHECK ke /api/transactiondetail
   │      - markOrderPaid() (idempoten)
   │
   └──► [Polling user: GET /api/transactiondetail]
          - response status=completed
          - markOrderPaid() (idempoten)

→ Mana saja yang menang, hasilnya sama: order=paid, akun terkirim.
```

---

## E. Total amount yang ditampilkan ke user

Pakasir menambah biaya gateway (mis. ~485 untuk transaksi 25.000). Karena itu sistem memisahkan kolom:

| Kolom `payments` | Nilai | Kegunaan |
|------------------|-------|----------|
| `amount_cents` | total order (yang merchant terima) | Dilaporkan ke Pakasir saat create + check |
| `fee_cents` | biaya gateway | Ditampilkan transparan ke user |
| `display_amount_cents` | `total_payment` (yang user bayar) | Ditampilkan di halaman pembayaran & QR |

Frontend halaman pembayaran menampilkan:

```
Subtotal           Rp 25.000
Diskon             - Rp 0
Biaya layanan      Rp 0
Total order        Rp 25.000
Fee gateway        Rp 485
─────────────────────────
Yang harus dibayar Rp 25.485
```

Jadi user paham nominal yang harus mereka transfer/scan.

---

## F. Sandbox testing

Selama proyek Pakasir dalam mode sandbox, alur testing yang direkomendasikan:

```bash
# 1. Buat order via UI (atau via curl /api/checkout)
# 2. Catat orderCode (mis. ORD-XXXXXXXX) dan totalCents (mis. 25000)

# 3. Trigger pembayaran sukses di sandbox
curl -L 'https://app.pakasir.com/api/paymentsimulation' \
  -H 'content-type: application/json' \
  -d '{
    "project": "<slug-proyek>",
    "order_id": "ORD-XXXXXXXX",
    "amount": 25000,
    "api_key": "<api-key>"
  }'
```

Setelah simulasi sukses:

- Webhook akan ter-trigger ke `/api/webhooks/pakasir` (jika di-set)
- Polling berikutnya dari client akan return `completed` → `markOrderPaid()`
- Akun digital dikirim ke pembeli

Atau dari halaman pembayaran (DEV mode), tombol **"(DEV) Simulasikan paid"** akan otomatis memanggil `paymentsimulation` lalu polling.

---

## G. Konfigurasi Transfer Bank Manual

Karena Pakasir hanya QRIS di sistem ini, transfer manual ditangani internal.

Lokasi pengaturan: **Admin Panel → Pengaturan Sistem → Transfer Bank Manual**.

Setting yang tersimpan di `app_settings`:

| Key | Default | Deskripsi |
|-----|---------|-----------|
| `manual_bank_enabled` | `0` | `1` untuk munculkan opsi di checkout. |
| `manual_bank_name` | `""` | Nama bank, mis. `BCA`, `Mandiri`. |
| `manual_bank_account` | `""` | Nomor rekening. |
| `manual_bank_holder` | `""` | Nama pemilik rekening. |
| `manual_bank_note` | `Pastikan transfer sesuai nominal terakhir agar mudah diverifikasi.` | Catatan opsional yang ditampilkan ke user. |

Saat user pilih transfer bank:

1. Sistem ambil rekening dari `app_settings` saat checkout.
2. User transfer manual ke rekening itu, upload bukti via halaman pembayaran.
3. Admin buka **detail order** (`/admin/order/:id`) untuk **melihat bukti transfer** yang diunggah user, lalu klik **"Tandai paid"** (perlu konfirmasi password admin). Tombol "Tandai paid" juga tersedia langsung dari daftar Order.
4. Setelah ditandai paid, akun digital dikirim ke user.

Tidak ada interaksi dengan Pakasir untuk metode ini.

---

## H. Migrasi & rollback

- **Disable Pakasir**: Hapus secret atau biarkan kosong. Sistem akan reject `paymentMethod=qris` dengan error jelas. Transfer bank manual (kalau aktif) dan saldo masih jalan.
- **Re-enable**: Set ulang secret. Tidak butuh restart kode.
- **Sandbox → Production**: Cukup ganti API key & slug ke proyek production di Pakasir. Tidak ada perubahan kode.

---

## I. Daftar file terkait

| Path | Tanggung jawab |
|------|----------------|
| `src/worker/services/payment/pakasir-provider.ts` | Implementasi class `PakasirPaymentProvider`. |
| `src/worker/services/payment/index.ts` | Factory `pakasirProvider(env)` + tipe. |
| `src/worker/services/payment/types.ts` | Interface `PaymentProvider`, `CreatePaymentInput`, dll. |
| `src/worker/services/order.ts` | Konsumen Pakasir saat checkout (`createOrderForUser`). |
| `src/worker/routes/orders.ts` | Polling status (`/check-status`), simulate dev (`/simulate-paid`). |
| `src/worker/routes/account.ts` | Top-up saldo via Pakasir QRIS. |
| `src/worker/routes/webhooks.ts` | Handler `POST /api/webhooks/pakasir`. |
| `src/client/pages/PaymentPage.tsx` | UI pembayaran (QR generator, countdown, polling). |
| `migrations/0002_pakasir_fields.sql` | Kolom `display_amount_cents`, `fee_cents`, `expires_at_provider`. |
| `migrations/0003_manual_bank_settings.sql` | Default keys untuk transfer bank manual. |
