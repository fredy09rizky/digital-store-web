# Design System — "Aurora Noir"

Referensi lengkap sistem UI/UX frontend **Pasar Premium**. Tujuan dokumen ini:
membuat pengembangan & perbaikan berikutnya cepat dan konsisten — siapa pun yang
melanjutkan tahu token apa yang dipakai, komponen mana yang harus dipakai ulang,
dan pola apa yang harus diikuti.

> Sumber gaya tunggal: `src/client/styles.css` (Tailwind v4, CSS-first via `@theme`
> + `@utility`). **Tidak ada** `tailwind.config.js` / `postcss.config.js`.

---

## 1. Filosofi & prinsip

**Nama tema:** Aurora Noir — *editorial fintech, calm-confidence*.
Tenang tapi tegas, premium seperti produk SaaS/fintech kelas atas. Bukan
"marketplace ramai".

Prinsip yang dipegang di seluruh halaman:

1. **Surface bertingkat, bukan card-on-card.** Hindari menumpuk banyak kartu
   putih ber-shadow. Pakai tier surface (`surface-soft` untuk background,
   `surface` untuk panel, `surface-tint` untuk aksen) + border tipis 1px +
   soft-shadow minimal.
2. **Satu aksen vibrant.** Iris/Violet (`--color-brand-*`) untuk aksi & highlight;
   Fuchsia (`--color-accent-*`) hanya untuk promo/diskon. Sisanya netral.
3. **Hierarki tipografi jelas.** Display (Space Grotesk) untuk judul, sans (Inter)
   untuk body/UI, mono (JetBrains Mono) untuk angka/kode/countdown.
4. **Ruang napas.** Lebih longgar; konten premium butuh padding & rhythm konsisten.
5. **Microinteraction tepat guna.** Hover lift, press, focus ring, entrance, shake
   error — bukan animasi gimmick. Hormati `prefers-reduced-motion`.
6. **Dark mode first-class.** Semua warna lewat token yang otomatis flip di `.dark`.
7. **Aksesibilitas.** Kontras AA, focus ring jelas, target tap ≥40px, label
   eksplisit, `role`/`aria` pada modal/alert/toast.

---

## 2. Tema light & dark

- **Default mengikuti sistem** (`prefers-color-scheme` perangkat): pengunjung baru
  yang perangkatnya dark mode akan melihat tampilan gelap, selain itu terang.
  Dark mode penuh tersedia via class `.dark` pada `<html>`. Begitu user menekan
  toggle, pilihannya (`light`/`dark`) disimpan & dipakai untuk kunjungan berikutnya.
- Dikelola di `src/client/lib/theme.ts`:
  - mode tersimpan di `localStorage` key `pp-theme`: `"light" | "dark" | "system"`.
  - `applyTheme()` dipanggil di `main.tsx` **sebelum** render (minim flash, CSP-safe
    tanpa inline script).
  - hook `useTheme()` → `{ mode, isDark, toggle, setMode }`.
- Toggle UI: komponen `ThemeToggle` (ikon sun/moon morph), dipasang di header user
  & sidebar/topbar admin.
- Mekanisme teknis: semua warna adalah CSS custom properties. Di `:root` (light)
  punya satu set nilai; selector `.dark` menimpa nilai yang sama. Karena utility &
  halaman membaca `var(--color-*)`, dark mode mengalir otomatis tanpa `dark:` manual.

> **Aturan penting:** jangan hardcode warna mentah Tailwind untuk surface/teks
> (mis. `bg-white`, `text-slate-700`, `bg-emerald-50`). Selalu pakai token
> (`bg-[var(--color-surface)]`, `text-[var(--color-ink-2)]`, atau utility seperti
> `card`, `chip`). Untuk status pakai `color-mix(... var(--color-success) ...)`.
> Warna solid `-500` (mis. `bg-emerald-500` untuk titik status) boleh karena
> terbaca di kedua tema.

---

## 3. Token `@theme`

### 3.1 Tipografi

| Token | Nilai | Pemakaian |
|---|---|---|
| `--font-display` | Space Grotesk | Judul `h1–h6`, hero, angka display besar |
| `--font-sans` | Inter | Body, tombol, navigasi, input, UI umum |
| `--font-ui` | JetBrains Mono | Harga, kode order, countdown, badge, label uppercase |
| `--font-mono` | JetBrains Mono | Alias mono eksplisit |

Dimuat via `<link>` Google Fonts di `index.html`. Heading otomatis pakai
`--font-display` (diset di `h1–h6`). Angka/harga: tambahkan
`style={{ fontFamily: "var(--font-ui)" }}` + class `tabular-nums`.

### 3.2 Warna — light (`:root`)

| Token | Hex | Fungsi |
|---|---|---|
| `--color-surface` | `#ffffff` | Kartu / panel terangkat |
| `--color-surface-soft` | `#f6f6fb` | Background halaman |
| `--color-surface-tint` | `#f1eefe` | Permukaan ber-aksen halus (nav aktif, info) |
| `--color-surface-mute` | `#eceaf3` | Separator lembut, field disabled, dasar skeleton |
| `--color-border` | `#e8e6f1` | Garis 1px halus |
| `--color-border-strong` | `#d6d3e4` | Garis tegas |
| `--color-brand-50…900` | iris/violet | Aksen utama; `500 = #5b4bda` (primary) |
| `--color-accent-50/500/600` | fuchsia | Promo/diskon; `500 = #c2389a` |
| `--color-aurora-1/2/3` | `#5b4bda`/`#8b3fd6`/`#c2389a` | Stop gradient hero/marketing |
| `--color-ink` | `#15131f` | Teks utama |
| `--color-ink-2` | `#56536c` | Teks sekunder |
| `--color-ink-3` | `#6f6c84` | Teks tersier/placeholder |
| `--color-ink-invert` | `#ffffff` | Teks di atas permukaan gelap |
| `--color-danger` | `#e11d48` | Error/destruktif |
| `--color-success` | `#0e9f6e` | Sukses |
| `--color-warning` | `#b9770a` | Peringatan |
| `--color-info` | `#4c3dc4` | Info (selaras brand) |

### 3.3 Warna — dark (`.dark` override)

Surface gelap (`surface-soft #0c0b12`, `surface #15131f`, `surface-tint #211c39`),
ink terang (`ink #eceaf7`), brand dicerahkan (`brand-500 #7d6cf2`, `brand-700
#b3a8f7` agar teks link/aksen kontras), status dinaikkan luminansinya
(`danger #fb6f92`, `success #34d399`, dst). Shadow berbasis hitam pekat.

### 3.4 Radius

| Token | Nilai | Pemakaian |
|---|---|---|
| `--radius-sm` | 8px | Chip, badge, input kecil |
| `--radius-md` | 12px | Button, input |
| `--radius-lg` | 18px | Card, modal, panel |
| `--radius-xl` | 24px | Hero, section besar |
| (pill) | 9999px | Pill, avatar, toggle |

### 3.5 Shadow

| Token | Pemakaian |
|---|---|
| `--shadow-card` | Kartu reguler (soft) |
| `--shadow-elev` | Hover/elevated, toast |
| `--shadow-modal` | Dialog/drawer |
| `--shadow-header` | Header sticky |
| `--shadow-glow` | Glow violet untuk CTA primary & pill aktif |
| `--shadow-focus` | Ring fokus violet (`:focus-visible`) |

### 3.6 Motion

`--ease-out-soft` = `cubic-bezier(0.22,1,0.36,1)` (kurva utama).

| Animasi | Token | Trigger |
|---|---|---|
| `fade-in` | `--animate-fade-in` | Page/section entrance |
| `slide-up` | `--animate-slide-up` | List/section masuk |
| `slide-down` | `--animate-slide-down` | Toast & Alert masuk (dari atas) |
| `scale-in` | `--animate-scale-in` | Modal/dialog buka |
| `float` | `--animate-float` | Kartu hero melayang |
| `shimmer` | `--animate-shimmer` | Skeleton loading |
| `aurora` | `--animate-aurora` | Blob gradient hero |
| `shake` | `--animate-shake` | Kartu form saat error (via `useShake`) |

Semua animasi dipangkas otomatis pada `prefers-reduced-motion: reduce`.

---

## 4. Utility `@utility` (referensi pakai)

Nama kelas lama dipertahankan agar konsisten, tapi definisinya ditulis ulang total.
Pakai utility ini alih-alih meng-hardcode style ad-hoc.

### Tombol
- `btn` — basis (jarang dipakai langsung).
- `btn-primary` — CTA utama (iris solid + glow). Press-scale saat `:active`.
- `btn-secondary` — surface terangkat berbentuk pill.
- `btn-outline` — border tipis, hover tint.
- `btn-ghost` — transparan, hover tint (link aksi).
- `btn-danger` — aksi destruktif.
- `btn-compact` — tombol kecil.
- `btn-icon` — tombol ikon bulat 40px.

> Di React, pakai komponen `Button`/`IconButton` (lihat §5), bukan class langsung,
> kecuali untuk anchor/elemen non-standar.

### Form
`input`, `textarea`, `select-input`, `label`, `help-text`, `error-text`.
Input fokus → border brand + `--shadow-focus`. Untuk input ber-ikon prefix:
bungkus relatif, ikon `absolute left-3 top-1/2 -translate-y-1/2`, input `!pl-9`.

### Surface
- `card` — panel utama (surface + border + shadow-card + radius-lg).
- `card-flat` — sama tanpa shadow (untuk grid kartu yang banyak).
- `card-tint` — panel ber-aksen halus (info/highlight).
- `glass` — permukaan kaca (hero/marketing, backdrop blur).

### Tipografi & label
- `section-title` — judul section (Space Grotesk 22px).
- `section-sub` — subjudul.
- `eyebrow` — label kecil uppercase tracking lebar (mono), warna brand.

### Badge & chip
`chip` (netral), `badge-promo` (fuchsia), `badge-best` (warning), `badge-ready`
(success), `badge-new`/`badge-info` (brand tint), `badge-hot` (danger).

### Pill & status
- `pill` / `pill-active` — filter kategori, toggle.
- `status-pill` — basis pill status order/pembayaran (dipakai komponen `StatusPill`).

### Navigasi & tabel
- `nav-link` / `nav-link-active` — item navigasi.
- `data-table` — tabel admin (header mono uppercase, hover row tint).

### Lain
- `divider` — garis 1px.
- `ring-focus` — ring fokus manual.
- `lift` — hover lift (translateY + shadow-elev) untuk kartu interaktif.
- `skeleton` — placeholder shimmer (dark-friendly).
- `aurora-blob` — blob blur beranimasi untuk hero/dashboard.
- `stagger` — entrance slide-up untuk item list.
- `scrollbar-none` — sembunyikan scrollbar (strip horizontal).

---

## 5. Komponen primitif (di `src/client/components/`)

Selalu pakai ulang komponen ini. **API publik stabil** — jangan ubah signature
tanpa alasan.

| Komponen | Ekspor | Catatan API |
|---|---|---|
| `Button.tsx` | `Button`, `LinkButton`, `AnchorButton`, `IconButton` | props: `variant` (`primary\|secondary\|outline\|ghost\|danger\|compact`), `size` (`sm\|md\|lg`), `loading`, `block`, `icon`, `iconRight`. `IconButton` butuh `icon` + `label` (a11y). |
| `ProductCard.tsx` | `ProductCard` | `{ p: PublicProductSummary }`. Image-first, `card-flat lift`, harga mono, ikon kategori lucide. |
| `ConfirmDialog.tsx` | `ConfirmDialog` | `tone` `default\|danger\|warning`, auto-focus tombol, ESC, scroll-lock, busy state. Untuk konfirmasi destruktif. |
| `Toast.tsx` | `useToast`, `useToastBus`, `ToastHost` | `useToast()` → `{ success, error, warn, info, push }`. Posisi atas (mobile tengah / desktop kanan). Durasi error 7s, warn 6s, lainnya 4.2s. |
| `Alert.tsx` | `Alert` | banner inline error/warn/success/info, `role="alert"`, auto-focus + scroll-into-view, dismissible. **Untuk error blocking di form.** |
| `Empty.tsx` | `Empty` | `{ title, hint?, icon?, action? }`. State kosong ilustratif. |
| `Loading.tsx` | `Loading`, `CardSkeleton`, `LineSkeleton`, `TableRowSkeleton`, `ListRowSkeleton`, `StatSkeleton`, `ReviewCardSkeleton`, `OrderRowSkeleton`, `CartItemSkeleton` | Skeleton pakai utility `skeleton` (shimmer). |
| `Pagination.tsx` | `Pagination` | `{ page, pageSize, total, onPageChange, disabled? }`. |
| `Thumbnail.tsx` | `Thumbnail` | `<img>` aman + fallback ikon. `loading="lazy"` default. |
| `StatusPill.tsx` | `StatusPill`, `ORDER_STATUS_INFO` | **Sumber tunggal** tampilan status order. Pakai di orders list, detail, payment, success. |
| `ThemeToggle.tsx` | `ThemeToggle` | Toggle light/dark. |
| `AppShell.tsx` | `AppShell` | `{ children, admin? }` → `UserShell` / `AdminShell`. |

Helper terkait:
- `lib/hooks.ts`: `useModalEffects` (scroll-lock + ESC + restore focus),
  `useBackdropClose`, `useShake` (animasi shake untuk error).
- `lib/category-icons.tsx`: `categoryIcon({ slug, name })` → ikon lucide relevan
  domain digital, dengan fallback deterministik (hash). **Ganti emoji kategori.**
- `lib/format.ts`: `rupiah`, `dateID`, `relativeID`, `countdown`.
- `lib/theme.ts`: `useTheme`, `applyTheme`, `setMode`.

---

## 6. Layout & shell

- **UserShell**: header kaca translucent (sticky, backdrop blur, border bawah) —
  brand mark aurora (komponen `BrandMark`), search pill prominent, nav, balance
  pill avatar, `ThemeToggle`, drawer mobile (search + kartu user + grid nav).
  Footer 3 kolom. Banner maintenance memakai surface-tint.
- **AdminShell**: sidebar 264px (desktop) / drawer (mobile), brand "Control Room",
  nav rounded dengan state aktif tint, `ThemeToggle`, footer "Lihat toko" + logout.
  Halaman `/admin/login` di-render tanpa shell (centered).
- **Container utama** user: `max-w-7xl px-4 sm:px-6 lg:px-8`.

### Pola sticky summary (flow user)
Cart / Checkout / Payment / Account memakai grid `lg:grid-cols-[1fr_360px]`
dengan panel ringkasan `card ... h-fit lg:sticky lg:top-20` di kanan. Di mobile
panel turun ke bawah (1 kolom).

### Hero / panel gradient
- **Hero homepage** kini memakai **warna solid** `#1b1547` (iris tua) + tekstur titik
  halus + garis aksen tipis fuchsia di tepi kiri — bukan gradient besar, dan judulnya
  **tanpa** gradient text-clip (warna solid `#c4b5ff`). Treatment ini sengaja dibuat
  lebih tegas/editorial, bukan look "template".
- **Header akun** dan **hero dashboard admin** masih memakai gradient "aurora deep"
  (`linear-gradient(135deg, #1b1547, #2a1d6b, #3a1f63)`) + `aurora-blob`.
- Pola umum panel gelap: konten di atasnya `relative` agar di atas blob. Teks putih +
  `bg-white/NN` untuk elemen kaca (sengaja putih translucent karena di atas panel
  gelap — bukan surface).

> Catatan: warna deep hero di-hardcode (`#1b1547` dst), **bukan** token, karena panel
> ini selalu gelap di light & dark — token brand akan flip di dark dan merusak kontras
> teks putih. Token `--color-aurora-*` & utility `aurora-blob` tetap dipakai di header
> akun, dashboard admin, avatar (AppShell), dan aksen invoice.

---

## 7. UX notifikasi — Alert vs Toast

Pemisahan kanal (penting, jangan dicampur):

- **Error yang menghalangi aksi** (login salah, voucher invalid, saldo kurang, OTP
  salah, kirim chat gagal, ganti password gagal) → **`Alert` inline** di dekat
  konteks (di atas/dalam form) + `useShake` pada kartu form. Tidak hilang sendiri,
  `role="alert"`, auto-focus. Sudah dipakai di: `LoginPage`, `RegisterPage`,
  `CheckoutPage`, `AccountPage` (modal password), `AdminLogin`, `ChatRoom`.
- **Feedback ringan / non-blocking** (sukses login, item ke keranjang, tersalin,
  tersimpan) → **toast** (`useToast`).

Pola standar di form:
```tsx
const { ref: cardRef, shake } = useShake<HTMLDivElement>();
const [err, setErr] = useState<string | null>(null);
// ...
<div className="card ..." ref={cardRef}>
  <form onSubmit={...}>
    {err && <Alert tone="error" onClose={() => setErr(null)}>{err}</Alert>}
    ...
  </form>
</div>
// di catch: setErr(pesan); shake();
```

> Jangan menaruh class `animate-scale-in` (entrance modal) pada elemen yang sama
> dengan target shake — keduanya mengeset properti `animation` dan bisa bentrok.
> Untuk modal, cukup tampilkan `Alert` (entrance slide-down) tanpa shake.

---

## 8. Status order/pembayaran

Selalu lewat `StatusPill` + `ORDER_STATUS_INFO` (`components/StatusPill.tsx`).
Lima status: `pending_payment` (warning), `paid` (success), `expired` (ink-3),
`cancelled` (danger), `refunded` (brand). Tone pakai `color-mix` token sehingga
konsisten light/dark. Jangan bikin map status pill baru per halaman.

Item terkirim (`DeliveredItem`) di **detail pesanan**: konten stok ditampilkan apa
adanya dalam blok teks mono (`<pre>` pre-wrap) dengan tombol show/hide + copy.
Halaman sukses & invoice **tidak** menampilkan konten (alasan keamanan); cukup arahkan
ke halaman pesanan.

---

## 9. Responsif & aksesibilitas

- Breakpoint diuji: **375 / 768 / 1024 / 1440**.
  - ≤640px: 1 kolom, drawer nav, panel ringkasan turun ke bawah.
  - ≥768px: grid 2 kolom (list/detail).
  - ≥1024px: sidebar admin + sticky right summary.
- Focus ring: `--shadow-focus` di `:focus-visible` (jangan dihapus dengan
  `outline-none` tanpa pengganti).
- `IconButton` wajib `label` (jadi `aria-label`+`title`).
- Modal: `role="dialog"`, `aria-modal`, ESC + scroll-lock via `useModalEffects`.
- Gambar: `loading="lazy"` untuk grid; `eager` hanya untuk hero/utama.
- Skeleton untuk setiap halaman list/detail (zero layout shift, match struktur).

---

## 10. Cara menambah halaman / komponen baru (checklist)

1. Pakai komponen primitif (`Button`, `card`, `input`, `Alert`, `Empty`,
   `StatusPill`, skeleton) — jangan styling ad-hoc.
2. Warna hanya via token (`var(--color-*)`) atau utility; **tidak** ada `bg-white`,
   `text-slate-*`, atau pastel `-50/-100` mentah (pakai `color-mix` token untuk
   status). Cek dark mode.
3. Ikon hanya dari `lucide-react`. Kategori → `categoryIcon()`. **Tidak ada emoji.**
4. Angka/harga/kode → `font-ui` + `tabular-nums`.
5. Error blocking → `Alert` + `useShake`; feedback ringan → toast.
6. Data dari `api()` (`lib/api.ts`), tipe dari `@shared/types` apa adanya. Backend
   sumber kebenaran — jangan hitung harga/diskon/stok di klien.
7. Sediakan skeleton + empty state.
8. Lazy-load route di `App.tsx` (kecuali HomePage yang eager).
9. Jalankan `npm run lint` & `npm run build` — harus lulus tanpa error / `any` baru.

---

## 11. Larangan (jangan lakukan)

- ❌ Warna biru `#307FE2` / oranye `#F46200` lama, atau font Exo/Exo 2.
- ❌ Emoji di UI (shell, kategori, hero, status). Pakai lucide.
- ❌ `bg-white` / `text-slate-*` / pastel `-50` mentah (rusak di dark mode).
- ❌ Map status pill / ikon kategori sendiri per halaman (pakai `StatusPill` /
  `categoryIcon`).
- ❌ Inline `<script>` atau eval (langgar CSP). Inline style atribut OK.
- ❌ Dependency runtime baru atau file config build baru (CSS-first via `@theme`).
- ❌ Menghapus fitur fungsional (countdown, copy, show/hide password, polling,
  ConfirmDialog destruktif, AdminConfirm).

---

## 12. File kunci

| File | Isi |
|---|---|
| `src/client/styles.css` | Token `@theme` + semua `@utility` + dark override |
| `src/client/lib/theme.ts` | Manajemen tema light/dark |
| `src/client/lib/category-icons.tsx` | Kategori → ikon lucide |
| `src/client/lib/hooks.ts` | `useModalEffects`, `useBackdropClose`, `useShake` |
| `src/client/components/*` | Komponen primitif (lihat §5) |
| `docs/DESIGN_SYSTEM.md` | Dokumen ini |
