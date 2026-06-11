import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Search,
  ShoppingCart,
  Receipt,
  User,
  LogIn,
  UserPlus,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Wallet,
  LayoutGrid,
  Package,
  Shapes,
  Boxes,
  Users,
  Ticket,
  Star,
  MessageCircle,
  Wrench,
  ScrollText,
  Gem,
} from "lucide-react";
import { useApp } from "../state/AppProviders";
import { api } from "../lib/api";
import { markAdminAuthed } from "../pages/admin/admin-session";
import { rupiah } from "../lib/format";
import { Button, IconButton } from "./Button";
import { ThemeToggle } from "./ThemeToggle";

export function AppShell({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  if (admin) return <AdminShell>{children}</AdminShell>;
  return <UserShell>{children}</UserShell>;
}

/* Brand mark — aurora gradient kotak dengan ikon Gem */
function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-xl shrink-0"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, var(--color-aurora-1), var(--color-aurora-2) 55%, var(--color-aurora-3))",
        boxShadow: "var(--shadow-glow)",
      }}
    >
      <Gem size={size * 0.46} className="text-white" />
    </span>
  );
}

/* ============================================================
   USER SHELL
   ============================================================ */
function UserShell({ children }: { children: React.ReactNode }) {
  const { boot, refreshBoot, cartCount } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => setOpen(false), [loc.pathname]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) nav(`/katalog?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main-content" className="skip-link">
        Lewati ke konten utama
      </a>
      {boot?.maintenance.active && (
        <div className="bg-[var(--color-surface-tint)] text-[var(--color-brand-700)] text-sm text-center py-2 border-b border-[var(--color-border)]">
          <span className="inline-flex items-center gap-2 font-medium">
            <Wrench size={14} />
            {boot.maintenance.message || "Sistem dalam pemeliharaan, checkout sementara ditutup."}
          </span>
        </div>
      )}

      {/* Header glass */}
      <header
        className="sticky top-0 z-40 border-b border-[var(--color-border)]"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-surface) 78%, transparent)",
          backdropFilter: "blur(14px) saturate(140%)",
          boxShadow: "var(--shadow-header)",
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <BrandMark />
            <div className="leading-tight hidden sm:block">
              <div className="font-bold tracking-tight text-[15px] text-[var(--color-ink)]" style={{ fontFamily: "var(--font-display)" }}>
                {boot?.appName ?? "Pasar Premium"}
              </div>
              <div className="eyebrow text-[10px]">Marketplace digital</div>
            </div>
          </Link>

          <form onSubmit={submitSearch} className="hidden md:flex flex-1 max-w-xl mx-4">
            <div className="flex w-full items-stretch h-11 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden focus-within:border-[var(--color-brand-400)] focus-within:shadow-[var(--shadow-focus)] transition">
              <div className="pl-4 grid place-items-center text-[var(--color-ink-3)]">
                <Search size={18} />
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari akun streaming, AI, tools…"
                aria-label="Cari produk"
                className="flex-1 min-w-0 bg-transparent px-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)] outline-none"
              />
              <button
                type="submit"
                aria-label="Cari"
                className="m-1 inline-flex items-center gap-1.5 px-4 rounded-full text-xs font-semibold bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white transition-colors"
              >
                <Search size={14} />
                Cari
              </button>
            </div>
          </form>

          <nav className="hidden lg:flex items-center gap-0.5 ml-auto">
            <TopLink to="/katalog" icon={LayoutGrid} label="Katalog" />
            {boot?.user && <TopLink to="/akun/pesanan" icon={Receipt} label="Pesanan" />}
            <TopLink to="/keranjang" icon={ShoppingCart} label="Keranjang" badge={cartCount} />
          </nav>

          <div className="ml-auto lg:ml-1 flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-grid" />
            {boot?.user ? (
              <Link
                to="/akun"
                className="hidden sm:flex items-center gap-2.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-brand-300)] transition px-2 py-1"
              >
                <div className="text-right leading-tight pl-1.5">
                  <div className="eyebrow text-[9px]">Saldo</div>
                  <div className="font-bold text-[13px] text-[var(--color-ink)] tabular-nums" style={{ fontFamily: "var(--font-ui)" }}>
                    {rupiah(boot.user.balanceCents)}
                  </div>
                </div>
                <div
                  className="size-8 rounded-full grid place-items-center text-sm font-bold text-white"
                  style={{ background: "linear-gradient(135deg, var(--color-aurora-1), var(--color-aurora-3))" }}
                >
                  {boot.user.username.slice(0, 1).toUpperCase()}
                </div>
              </Link>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                <Link to="/login" className="btn-ghost">
                  <LogIn size={16} /> Masuk
                </Link>
                <Link to="/register" className="btn-primary">
                  <UserPlus size={16} /> Daftar
                </Link>
              </div>
            )}
            <button
              className="lg:hidden btn-icon"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Tutup menu" : "Buka menu"}
              aria-expanded={open}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {open && (
          <div className="lg:hidden border-t border-[var(--color-border)] bg-[var(--color-surface)] animate-slide-up">
            <div className="px-4 py-3 space-y-3 max-w-7xl mx-auto">
              <form onSubmit={submitSearch} className="flex items-stretch h-11 rounded-full border border-[var(--color-border)] overflow-hidden">
                <div className="pl-4 grid place-items-center text-[var(--color-ink-3)]">
                  <Search size={16} />
                </div>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Cari produk…"
                  aria-label="Cari produk"
                  className="flex-1 min-w-0 bg-transparent px-2.5 text-sm outline-none text-[var(--color-ink)]"
                />
                <button className="m-1 inline-flex items-center gap-1.5 px-4 rounded-full text-xs font-semibold bg-[var(--color-brand-500)] text-white">
                  <Search size={14} />
                </button>
              </form>

              {boot?.user && (
                <Link to="/akun" className="flex items-center gap-3 card-flat p-3">
                  <div
                    className="size-10 rounded-full grid place-items-center text-base font-bold text-white"
                    style={{ background: "linear-gradient(135deg, var(--color-aurora-1), var(--color-aurora-3))" }}
                  >
                    {boot.user.username.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--color-ink)] truncate">{boot.user.username}</div>
                    <div className="text-xs text-[var(--color-ink-2)] tabular-nums" style={{ fontFamily: "var(--font-ui)" }}>
                      Saldo {rupiah(boot.user.balanceCents)}
                    </div>
                  </div>
                </Link>
              )}

              <div className="grid grid-cols-2 gap-2">
                <DrawerLink to="/katalog" icon={LayoutGrid} label="Katalog" />
                <DrawerLink to="/keranjang" icon={ShoppingCart} label="Keranjang" badge={cartCount} />
                {boot?.user && <DrawerLink to="/akun/pesanan" icon={Receipt} label="Pesanan" />}
                {boot?.user && <DrawerLink to="/akun" icon={User} label="Akun" />}
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-xs text-[var(--color-ink-2)]">Tampilan</span>
                <ThemeToggle />
              </div>

              {boot?.user ? (
                <Button
                  variant="outline"
                  block
                  icon={LogOut}
                  onClick={async () => {
                    await api("/auth/logout", { method: "POST", body: {} }).catch(() => null);
                    await refreshBoot();
                    nav("/");
                  }}
                >
                  Keluar
                </Button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/login" className="btn-outline">
                    <LogIn size={16} /> Masuk
                  </Link>
                  <Link to="/register" className="btn-primary">
                    <UserPlus size={16} /> Daftar
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 lg:py-10 focus:outline-none">
        {children}
      </main>

      <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)] mt-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 grid sm:grid-cols-3 gap-8 text-sm">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <BrandMark size={32} />
              <div className="font-bold text-[var(--color-ink)]" style={{ fontFamily: "var(--font-display)" }}>
                {boot?.appName ?? "Pasar Premium"}
              </div>
            </div>
            <p className="text-[var(--color-ink-2)] leading-relaxed">
              Marketplace item digital premium dengan reservasi stok yang aman dan akun yang
              terkirim instan setelah pembayaran sukses.
            </p>
          </div>
          <div>
            <div className="font-bold text-[var(--color-ink)] mb-3">Pembayaran</div>
            <ul className="text-[var(--color-ink-2)] space-y-2">
              <li className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-[var(--color-brand-500)]" /> QRIS via Pakasir
              </li>
              <li className="flex items-center gap-2">
                <Wallet size={14} className="text-[var(--color-brand-500)]" /> Saldo internal
              </li>
              <li className="flex items-center gap-2">
                <Receipt size={14} className="text-[var(--color-brand-500)]" /> Transfer manual
              </li>
            </ul>
          </div>
          <div>
            <div className="font-bold text-[var(--color-ink)] mb-3">Komitmen kami</div>
            <p className="text-[var(--color-ink-2)] leading-relaxed">
              Akun diverifikasi sebelum tampil. Refund disetujui admin masuk ke saldo. Garansi
              sesuai catatan tiap produk.
            </p>
          </div>
        </div>
        <div className="border-t border-[var(--color-border)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 text-xs text-[var(--color-ink-3)] flex flex-wrap items-center justify-between gap-2">
            <div>© {new Date().getFullYear()} {boot?.appName ?? "Pasar Premium"}. Semua hak dilindungi.</div>
            <div>Stok aman · Akun instan · Bergaransi</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function TopLink({
  to,
  icon: Icon,
  label,
  badge,
}: {
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => "relative nav-link " + (isActive ? "nav-link-active" : "")}
    >
      <Icon size={16} />
      {label}
      {!!badge && badge > 0 && (
        <span
          className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold tabular-nums"
          style={{ backgroundColor: "var(--color-accent-500)", fontFamily: "var(--font-ui)" }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
}

function DrawerLink({
  to,
  icon: Icon,
  label,
  badge,
}: {
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        "relative inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold border transition " +
        (isActive
          ? "bg-[var(--color-surface-tint)] text-[var(--color-brand-700)] border-[var(--color-brand-300)]"
          : "bg-[var(--color-surface)] text-[var(--color-ink-2)] border-[var(--color-border)] hover:border-[var(--color-brand-300)]")
      }
    >
      <Icon size={16} />
      {label}
      {!!badge && badge > 0 && (
        <span
          className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold"
          style={{ backgroundColor: "var(--color-accent-500)" }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
}

/* ============================================================
   ADMIN SHELL
   ============================================================ */
function AdminShell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [loc.pathname]);

  if (loc.pathname === "/admin/login") {
    return <main className="min-h-screen grid place-items-center p-6">{children}</main>;
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[264px_1fr]">
      <a href="#admin-content" className="skip-link">
        Lewati ke konten utama
      </a>
      <aside className="hidden lg:block bg-[var(--color-surface)] border-r border-[var(--color-border)] sticky top-0 h-screen overflow-y-auto">
        <AdminSidebarInner onLogout={() => doAdminLogout(nav)} />
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <BrandMark size={36} />
          <div className="leading-tight">
            <div className="font-bold text-[var(--color-ink)] text-sm" style={{ fontFamily: "var(--font-display)" }}>
              Control Room
            </div>
            <div className="eyebrow text-[9px]">Pasar Premium</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <IconButton icon={open ? X : Menu} label={open ? "Tutup menu" : "Buka menu"} onClick={() => setOpen((v) => !v)} />
        </div>
      </header>
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[284px] bg-[var(--color-surface)] shadow-[var(--shadow-modal)] overflow-y-auto animate-slide-up">
            <AdminSidebarInner onLogout={() => doAdminLogout(nav)} />
          </aside>
        </div>
      )}

      <main id="admin-content" tabIndex={-1} className="p-4 sm:p-6 lg:p-8 max-w-full overflow-x-hidden focus:outline-none">{children}</main>
    </div>
  );
}

async function doAdminLogout(nav: (to: string) => void) {
  await api("/admin/auth/logout", { method: "POST", body: {} }).catch(() => null);
  markAdminAuthed(false);
  nav("/admin/login");
}

const ADMIN_NAVS: { to: string; icon: React.ComponentType<{ size?: number; className?: string }>; label: string; end?: boolean }[] = [
  { to: "/admin", icon: LayoutGrid, label: "Dashboard", end: true },
  { to: "/admin/produk", icon: Package, label: "Produk" },
  { to: "/admin/kategori", icon: Shapes, label: "Kategori" },
  { to: "/admin/order", icon: Receipt, label: "Order" },
  { to: "/admin/user", icon: Users, label: "User" },
  { to: "/admin/voucher", icon: Ticket, label: "Voucher" },
  { to: "/admin/review", icon: Star, label: "Review" },
  { to: "/admin/support", icon: MessageCircle, label: "Support" },
  { to: "/admin/maintenance", icon: Wrench, label: "Maintenance" },
  { to: "/admin/audit", icon: ScrollText, label: "Audit Log" },
];

function AdminSidebarInner({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="p-4 flex flex-col h-full">
      <div className="flex items-center justify-between mb-5">
        <Link to="/admin" className="flex items-center gap-2.5">
          <BrandMark size={40} />
          <div className="leading-tight">
            <div className="font-bold text-[var(--color-ink)]" style={{ fontFamily: "var(--font-display)" }}>
              Control Room
            </div>
            <div className="eyebrow text-[9px]">Pasar Premium</div>
          </div>
        </Link>
        <ThemeToggle />
      </div>

      <nav className="space-y-1 flex-1">
        {ADMIN_NAVS.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition " +
              (isActive
                ? "bg-[var(--color-surface-tint)] text-[var(--color-brand-700)] font-semibold"
                : "text-[var(--color-ink-2)] hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-ink)]")
            }
          >
            <n.icon size={16} />
            {n.label}
          </NavLink>
        ))}
      </nav>

      <div className="pt-4 mt-2 border-t border-[var(--color-border)] space-y-1">
        <Link
          to="/"
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--color-ink-2)] hover:bg-[var(--color-surface-soft)]"
        >
          <Boxes size={16} /> Lihat toko
        </Link>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--color-danger)] hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] transition"
        >
          <LogOut size={16} /> Keluar
        </button>
      </div>
    </div>
  );
}
