-- Stok kini bersifat "konten bebas" (tanpa parsing): tiap item = satu blok teks
-- apa adanya (akun, kode, link, blob, dll), maks 2000 karakter, dikirim verbatim.
--
-- Tambah kolom `payload_content` (nullable). Stok BARU mengisi kolom ini; kolom
-- akun lama (payload_email/password/note/expiry/extra) tetap untuk stok LAMA agar
-- tidak ada data yang rusak. Tampilan pengiriman membaca payload_content bila ada,
-- selain itu jatuh ke format akun lama.
ALTER TABLE product_inventory_items ADD COLUMN payload_content TEXT;
