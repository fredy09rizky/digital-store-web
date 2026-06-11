import type { ComponentType } from "react";
import {
  Clapperboard,
  Bot,
  GraduationCap,
  Languages,
  Code,
  Wrench,
  Music2,
  Headphones,
  Mic,
  Gamepad2,
  ShieldCheck,
  KeyRound,
  Cloud,
  Server,
  Database,
  Bitcoin,
  Wallet,
  CreditCard,
  Coins,
  BookOpen,
  Tv,
  Palette,
  Brush,
  PenTool,
  Mail,
  Crown,
  Ticket,
  Sparkles,
  ShoppingCart,
  Users,
  FolderKanban,
  Briefcase,
  Globe,
  FileText,
  Smartphone,
  Newspaper,
  Gift,
  Star,
  Package,
  Boxes,
  Box,
  Shapes,
  Tag,
  Layers,
  Zap,
} from "lucide-react";

type IconC = ComponentType<{ size?: number; className?: string }>;

/**
 * Pemetaan kategori → ikon lucide berdasarkan kata kunci pada slug/nama.
 * Mengganti emoji yang sebelumnya disimpan di `category.icon`. Selalu
 * mengembalikan ikon vektor — tidak pernah emoji.
 *
 * KONTEKS: toko ini menjual ITEM DIGITAL — akun/langganan premium, voucher &
 * kartu digital, top-up, lisensi software, dan sejenisnya. Kata kunci sengaja
 * dijaga relevan dengan ranah digital (ID + Inggris), bukan barang fisik.
 *
 * Aturan dievaluasi berurutan (atas → bawah), yang pertama cocok dipakai —
 * jadi taruh yang lebih spesifik lebih dulu. Kalau tidak ada yang cocok,
 * dipakai fallback deterministik (lihat `fallbackIcon`).
 */
const RULES: { match: RegExp; icon: IconC }[] = [
  // Hiburan / streaming
  { match: /(stream|streaming|nonton|tv|televisi|video|film|movie|series|serial|vod|ott|entertainment|hiburan|bioskop|cinema)/i, icon: Clapperboard },
  { match: /(youtube|netflix|disney|prime\s*video|hbo|apple\s*tv|viu|wetv|iqiyi|vidio|channel|channels|\blive\b|siaran)/i, icon: Tv },

  // AI
  { match: /(\bai\b|gpt|chatgpt|llm|\bbot\b|chatbot|\bml\b|machine\s*learning|kecerdasan\s*buatan|artificial\s*intelligence|generative|midjourney|gemini|claude|copilot)/i, icon: Bot },

  // Edukasi / kursus / bahasa
  { match: /(edu|pendidikan|kursus|belajar|course|kelas|akademi|sekolah|training|tutorial|pelatihan|lesson|learning|udemy|skillshare|coursera|skill)/i, icon: GraduationCap },
  { match: /(language|bahasa|translate|terjemah|duolingo|grammar|toefl|ielts|babbel)/i, icon: Languages },

  // Developer / software / tools
  { match: /(\bdev\b|developer|coding|program|programming|engineering|sdk|\bapi\b|github|gitlab|ide|compiler|framework|jetbrains|copilot)/i, icon: Code },
  { match: /(software|lisensi|license|licence|aktivasi|activation|windows|microsoft|office\s*365|key\b|serial|aplikasi\s*pc)/i, icon: FileText },
  { match: /(tools|tool|utility|utilities|alat|plugin|extension|add-?on)/i, icon: Wrench },
  { match: /(app|aplikasi|mobile|smartphone|android|ios|playstore|app\s*store)/i, icon: Smartphone },

  // Musik / audio / podcast
  { match: /(music|musik|lagu|spotify|tidal|deezer|soundcloud|joox|apple\s*music|playlist)/i, icon: Music2 },
  { match: /(audio|headphone|headphones|headset|earphone)/i, icon: Headphones },
  { match: /(podcast|\bmic\b|microphone|voice|rekaman|recording)/i, icon: Mic },

  // Game
  { match: /(game|gaming|gamer|\bmain\b|e-?sports|steam|console|ps5|ps4|xbox|nintendo|playstation|valorant|mobile\s*legends|genshin|diamond|\buc\b|top\s*up\s*game)/i, icon: Gamepad2 },

  // Keamanan / VPN / akun & password
  { match: /(vpn|security|secure|privasi|privacy|proteksi|enkripsi|encryption|firewall|antivirus|keamanan)/i, icon: ShieldCheck },
  { match: /(password|passwords|auth|2fa|otp|kredensial|credential|login|akun\s*manager)/i, icon: KeyRound },

  // Cloud / hosting / infra
  { match: /(cloud|drive|penyimpanan|backup|sync|sinkron|dropbox|onedrive|gdrive|google\s*drive|icloud|mega)/i, icon: Cloud },
  { match: /(hosting|vps|server|deploy|panel|cpanel|dedicated)/i, icon: Server },
  { match: /(database|\bdb\b|sql|nosql|firebase|supabase)/i, icon: Database },
  { match: /(domain|dns|web\b|website|\bsite\b|internet|online|landing)/i, icon: Globe },

  // Keuangan digital / crypto / wallet / voucher / kartu
  { match: /(crypto|bitcoin|\bbtc\b|ethereum|\beth\b|blockchain|web3|\bnft\b|binance|exchange)/i, icon: Bitcoin },
  { match: /(wallet|dompet|e-?wallet|gopay|ovo|\bdana\b|shopeepay|linkaja|saldo)/i, icon: Wallet },
  { match: /(voucher|gift\s*card|giftcard|kartu\s*digital|kartu\s*hadiah|redeem|kode\s*voucher|prepaid|pulsa|top\s*up|topup)/i, icon: Ticket },
  { match: /(card|kartu|payment|payments|debit|credit|billing|invoice|tagihan|pembayaran)/i, icon: CreditCard },
  { match: /(finance|keuangan|investasi|invest|saham|stock|trading|reksadana|coin|coins|fintech)/i, icon: Coins },

  // Konten / baca / berita
  { match: /(ebook|e-?book|book|buku|read|reading|baca|library|perpustakaan|majalah|magazine|komik|comic|manga|novel)/i, icon: BookOpen },
  { match: /(news|berita|koran|press|blog|artikel|article|update\s*harian)/i, icon: Newspaper },

  // Desain / kreatif
  { match: /(design|desain|creative|kreatif|grafis|graphic|illustration|ilustrasi|canva|figma|sketch|template|mockup|aset|asset)/i, icon: Palette },
  { match: /(adobe|photoshop|lightroom|edit\s*foto|editing|brush|drawing|menggambar|capcut|premiere)/i, icon: Brush },
  { match: /(writing|penulis|copywriting|notion|docs\s*tool|catatan|note\s*app)/i, icon: PenTool },

  // Email / komunikasi
  { match: /(mail|email|surat|inbox|newsletter|smtp|outlook|gmail)/i, icon: Mail },

  // Produktivitas / kerja / bisnis / sosial
  { match: /(project|proyek|task|tugas|kanban|productivity|produktif|produktivitas|workflow|manajemen|management|workspace)/i, icon: FolderKanban },
  { match: /(office|kantor|work|kerja|business|bisnis|enterprise|corporate|company|perusahaan|startup|professional)/i, icon: Briefcase },
  { match: /(social|sosial|community|komunitas|forum|group|groups|member|follower|instagram|tiktok|telegram|discord)/i, icon: Users },

  // Tier / langganan / status
  { match: /(premium|\bpro\b|vip|elite|plus|deluxe|ultimate|unlimited)/i, icon: Crown },
  { match: /(subscription|langganan|membership|recurring|berlangganan|paket)/i, icon: Sparkles },
  { match: /(new|baru|trend|trending|populer|popular|\bhot\b|featured|rekomendasi|recommended|pilihan)/i, icon: Zap },

  // Toko / marketplace / umum
  { match: /(shop|store|market|marketplace|toko|belanja|e-?commerce|cart|keranjang|jual)/i, icon: ShoppingCart },
  { match: /(gift|hadiah|reward|bonus|kado)/i, icon: Gift },
  { match: /(label|tag|kategori\s*umum|umum|general|lain|lainnya|other|others|misc|bundle|paket\s*item)/i, icon: Tag },
];

/** Kumpulan ikon netral untuk fallback deterministik. */
const FALLBACK_POOL: IconC[] = [Package, Boxes, Box, Shapes, Tag, Star, Layers, Gift];

/** Hash string sederhana & stabil (djb2) untuk memilih ikon fallback. */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return Math.abs(h);
}

/**
 * Ikon fallback ketika nama/slug tidak cocok dengan kata kunci mana pun.
 * Dipilih dari `FALLBACK_POOL` berdasarkan hash supaya konsisten per kategori
 * (kategori yang sama selalu dapat ikon yang sama) namun bervariasi
 * antar-kategori sehingga tidak monoton.
 */
function fallbackIcon(key: string): IconC {
  if (!key) return Package;
  return FALLBACK_POOL[hashString(key) % FALLBACK_POOL.length];
}

export function categoryIcon(input?: { slug?: string | null; name?: string | null } | null): IconC {
  const key = `${input?.slug ?? ""} ${input?.name ?? ""}`.trim();
  if (key) {
    for (const r of RULES) if (r.match.test(key)) return r.icon;
  }
  return fallbackIcon(key);
}
