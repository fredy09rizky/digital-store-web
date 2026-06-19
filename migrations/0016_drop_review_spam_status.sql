-- 0016_drop_review_spam_status.sql
--
-- Status review 'spam' dihapus. Tombol "Spam" di admin tidak ada lagi karena
-- 'reject' sudah mewakili semua penolakan (spam, tidak pantas, tidak sesuai,
-- dll). Secara fungsi 'spam' dan 'rejected' identik: sama-sama tidak tampil ke
-- publik dan sama-sama tidak dihitung di agregat rating.
--
-- Baris lama yang terlanjur berstatus 'spam' dikonversi ke 'rejected'. Karena
-- keduanya sama-sama TIDAK ikut agregat (hanya 'approved' yang dihitung),
-- konversi ini tidak mengubah rating_sum/rating_count produk mana pun.

UPDATE reviews SET status = 'rejected', updated_at = strftime('%s','now') WHERE status = 'spam';
