-- Default settings untuk transfer manual.
-- Admin dapat mengubahnya dari halaman Maintenance/Settings.
INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES
 ('manual_bank_enabled',  '0',                                      strftime('%s','now')),
 ('manual_bank_name',     '',                                       strftime('%s','now')),
 ('manual_bank_account',  '',                                       strftime('%s','now')),
 ('manual_bank_holder',   '',                                       strftime('%s','now')),
 ('manual_bank_note',     'Pastikan transfer sesuai nominal terakhir agar mudah diverifikasi.', strftime('%s','now'));
