-- Tambahan kolom payment untuk integrasi Pakasir.
-- display_amount_cents = total_payment yang user bayar (sudah termasuk fee Pakasir).
-- fee_cents = fee gateway.
ALTER TABLE payments ADD COLUMN display_amount_cents INTEGER;
ALTER TABLE payments ADD COLUMN fee_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN expires_at_provider INTEGER;
