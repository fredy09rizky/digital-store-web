// Pastikan folder dist/client ada sebelum wrangler dev dijalankan.
//
// wrangler dev akan reject startup kalau directory yang ditunjuk
// `[assets].directory` di wrangler.toml belum eksis. Saat dev kita tidak
// butuh hasil build aktual (Vite dev server di :5173 yang melayani SPA),
// tapi binding `env.ASSETS` tetap perlu folder valid agar Worker bisa
// boot. Skrip ini idempotent dan aman dipanggil ulang.

import { mkdirSync } from "node:fs";
mkdirSync("dist/client", { recursive: true });
