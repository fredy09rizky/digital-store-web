import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogIn, TimerOff } from "lucide-react";
import { api, setSessionExpiredHandler, type SessionExpiredKind } from "../lib/api";
import { wasAdminAuthed } from "../pages/admin/admin-session";
import { ToastHost, useToastBus } from "../components/Toast";

export interface BootstrapData {
  appName: string;
  maintenance: { active: boolean; message: string };
  paymentOptions: { qris: boolean; bankTransfer: boolean; wallet: boolean };
  manualBank: { name: string; account: string; holder: string; note: string } | null;
  user: { id: string; username: string; email: string; balanceCents: number } | null;
}

interface AppContextValue {
  boot: BootstrapData | null;
  refreshBoot: () => Promise<void>;
  setUser: (u: BootstrapData["user"]) => void;
  cartCount: number;
  refreshCart: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const v = useContext(AppContext);
  if (!v) throw new Error("AppContext belum siap");
  return v;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = useState<BootstrapData | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const toastBus = useToastBus();

  const refreshBoot = useCallback(async () => {
    try {
      const data = await api<BootstrapData>("/bootstrap");
      setBoot(data);
    } catch {
      setBoot({
        appName: "Pasar Premium",
        maintenance: { active: false, message: "" },
        paymentOptions: { qris: true, bankTransfer: false, wallet: true },
        manualBank: null,
        user: null,
      });
    }
  }, []);

  const setUser = useCallback((u: BootstrapData["user"]) => {
    setBoot((prev) => (prev ? { ...prev, user: u } : prev));
  }, []);

  const refreshCart = useCallback(async () => {
    if (!boot?.user) {
      setCartCount(0);
      return;
    }
    try {
      const c = await api<{ items: { id: string; qty: number }[] }>("/cart");
      const total = (c.items ?? []).reduce((s, it) => s + (it.qty ?? 0), 0);
      setCartCount(total);
    } catch {
      // diam: badge cart bukan blocker. Tampilkan 0 saja kalau gagal.
      setCartCount(0);
    }
  }, [boot?.user]);

  useEffect(() => {
    refreshBoot();
  }, [refreshBoot]);

  // Sync cart count saat status login berubah.
  useEffect(() => {
    refreshCart();
  }, [refreshCart, boot?.user?.id]);

  const ctx = useMemo<AppContextValue>(
    () => ({ boot, refreshBoot, setUser, cartCount, refreshCart }),
    [boot, refreshBoot, setUser, cartCount, refreshCart],
  );

  return (
    <AppContext.Provider value={ctx}>
      <toastBus.Provider>
        {children}
        <SessionWatcher />
        <ToastHost />
      </toastBus.Provider>
    </AppContext.Provider>
  );
}

const SESSION_CHECK_INTERVAL_MS = 3 * 60 * 1000;

/**
 * Memantau validitas sesi dan menendang user/admin secara mulus saat sesi
 * habis:
 *   - Reaktif: handler global yang dipanggil `api()` ketika sebuah request
 *     dapat balasan 401 sesi (saat user/admin mengklik aksi apa pun).
 *   - Proaktif: cek berkala tiap beberapa menit (ping endpoint ringan) supaya
 *     user/admin yang sedang idle pun tahu sesinya berakhir tanpa harus klik.
 *
 * Saat terdeteksi habis: tampilkan popup informasi lalu arahkan ke halaman
 * login yang sesuai. Penjagaan konteks mencegah popup muncul untuk tamu.
 */
function SessionWatcher() {
  const { boot, setUser } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [expired, setExpired] = useState<SessionExpiredKind | null>(null);

  const onLoginPage = loc.pathname === "/login" || loc.pathname === "/admin/login";
  const inAdminArea = loc.pathname.startsWith("/admin") && loc.pathname !== "/admin/login";
  const loggedInUser = !!boot?.user;

  // Konteks terbaru disimpan di ref agar handler/interval selalu membaca nilai
  // sekarang tanpa harus mendaftar ulang.
  const ctxRef = useRef({ inAdminArea, loggedInUser, expired, onLoginPage });
  useEffect(() => {
    ctxRef.current = { inAdminArea, loggedInUser, expired, onLoginPage };
  }, [inAdminArea, loggedInUser, expired, onLoginPage]);

  // Handler reaktif: dipanggil dari api() saat 401 sesi.
  useEffect(() => {
    setSessionExpiredHandler((kind) => {
      const c = ctxRef.current;
      if (c.expired || c.onLoginPage) return;
      if (kind === "admin" && c.inAdminArea && wasAdminAuthed()) setExpired("admin");
      else if (kind === "user" && c.loggedInUser && !c.inAdminArea) setExpired("user");
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  // Bila sudah di halaman login, jangan tampilkan popup.
  useEffect(() => {
    if (onLoginPage && expired) setExpired(null);
  }, [onLoginPage, expired]);

  // Cek proaktif berkala. Ping endpoint ringan; bila sesi habis, balasan 401
  // memicu handler reaktif di atas.
  useEffect(() => {
    if (expired || onLoginPage) return;
    if (!loggedInUser && !inAdminArea) return;
    const id = setInterval(() => {
      const c = ctxRef.current;
      if (c.expired) return;
      if (c.inAdminArea && wasAdminAuthed()) {
        api("/admin/auth/me").catch(() => {});
      } else if (c.loggedInUser && !c.inAdminArea) {
        api("/account/me").catch(() => {});
      }
    }, SESSION_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [expired, onLoginPage, loggedInUser, inAdminArea]);

  if (!expired || onLoginPage) return null;

  const isAdmin = expired === "admin";
  const goLogin = () => {
    if (isAdmin) {
      setExpired(null);
      nav("/admin/login", { replace: true });
    } else {
      setUser(null);
      const next = encodeURIComponent(loc.pathname + loc.search);
      setExpired(null);
      nav(`/login?next=${next}`, { replace: true });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/50 grid place-items-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="card max-w-sm w-full p-6 my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto animate-scale-in text-center">
        <div className="mx-auto size-12 rounded-xl bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-warning)] grid place-items-center mb-3">
          <TimerOff size={24} />
        </div>
        <div
          className="font-extrabold text-lg text-[var(--color-ink)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Sesi kamu sudah berakhir
        </div>
        <p className="text-sm text-[var(--color-ink-2)] mt-1.5 leading-relaxed">
          {isAdmin
            ? "Sesi admin sudah tidak aktif demi keamanan. Silakan login ulang untuk melanjutkan."
            : "Demi keamanan, sesi login kamu sudah habis. Silakan login lagi untuk melanjutkan."}
        </p>
        <button type="button" onClick={goLogin} className="btn-primary w-full mt-5">
          <LogIn size={16} /> Login ulang
        </button>
      </div>
    </div>
  );
}
