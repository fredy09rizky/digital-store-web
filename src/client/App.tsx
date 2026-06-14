import { Suspense, lazy, useEffect, useState } from "react";
import { Route, Routes, useLocation, Link } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AppProviders } from "./state/AppProviders";
import { ProtectedRoute, AdminRoute } from "./state/RouteGuards";
import HomePage from "./pages/HomePage";

const CatalogPage = lazy(() => import("./pages/CatalogPage"));
const ProductDetailPage = lazy(() => import("./pages/ProductDetailPage"));
const CartPage = lazy(() => import("./pages/CartPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const PaymentPage = lazy(() => import("./pages/PaymentPage"));
const OrderSuccessPage = lazy(() => import("./pages/OrderSuccessPage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage"));
const SupportChatPage = lazy(() => import("./pages/SupportChatPage"));
const SupportGeneralPage = lazy(() => import("./pages/SupportGeneralPage"));
const InvoicePage = lazy(() => import("./pages/InvoicePage"));

const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories"));
const AdminStock = lazy(() => import("./pages/admin/AdminStock"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminOrderDetail = lazy(() => import("./pages/admin/AdminOrderDetail"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminVouchers = lazy(() => import("./pages/admin/AdminVouchers"));
const AdminReviews = lazy(() => import("./pages/admin/AdminReviews"));
const AdminSupport = lazy(() => import("./pages/admin/AdminSupport"));
const AdminMaintenance = lazy(() => import("./pages/admin/AdminMaintenance"));
const AdminAuditLogs = lazy(() => import("./pages/admin/AdminAuditLogs"));

/**
 * Suspense fallback yang menunda kemunculan UI loading sampai chunk benar-
 * benar belum siap setelah `delay` ms. Tujuannya menghilangkan flicker
 * "Memuat…" saat chunk lazy-loaded selesai dengan cepat (umumnya <150ms).
 *
 * Kalau chunk sudah selesai sebelum timer habis, Suspense unmount fallback
 * ini sebelum sempat tampil, jadi user tidak melihat apa-apa.
 */
function PageFallback({ delay = 150 }: { delay?: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  if (!show) return null;
  return (
    <div className="min-h-[60vh] grid place-items-center text-[var(--color-ink-2)]">
      <div className="animate-fade-in flex items-center gap-2 text-sm">
        <span className="size-2.5 rounded-full bg-[var(--color-brand-500)] animate-pulse" />
        <span>Memuat…</span>
      </div>
    </div>
  );
}

export default function App() {
  const loc = useLocation();
  const inAdmin = loc.pathname.startsWith("/admin");
  return (
    <AppProviders>
      <AppShell admin={inAdmin}>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/katalog" element={<CatalogPage />} />
            <Route path="/p/:slug" element={<ProductDetailPage />} />
            <Route path="/keranjang" element={<ProtectedRoute><CartPage /></ProtectedRoute>} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
            <Route path="/pembayaran/:idOrCode" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />
            <Route path="/sukses/:idOrCode" element={<ProtectedRoute><OrderSuccessPage /></ProtectedRoute>} />
            <Route path="/akun" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
            <Route path="/akun/support" element={<ProtectedRoute><SupportGeneralPage /></ProtectedRoute>} />
            <Route path="/akun/pesanan" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
            <Route path="/akun/pesanan/:idOrCode" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
            <Route path="/akun/pesanan/:idOrCode/chat" element={<ProtectedRoute><SupportChatPage /></ProtectedRoute>} />
            <Route path="/akun/pesanan/:idOrCode/invoice" element={<ProtectedRoute><InvoicePage /></ProtectedRoute>} />

            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            <Route path="/admin/produk" element={<AdminRoute><AdminProducts /></AdminRoute>} />
            <Route path="/admin/kategori" element={<AdminRoute><AdminCategories /></AdminRoute>} />
            <Route path="/admin/stok/:productId" element={<AdminRoute><AdminStock /></AdminRoute>} />
            <Route path="/admin/order" element={<AdminRoute><AdminOrders /></AdminRoute>} />
            <Route path="/admin/order/:id" element={<AdminRoute><AdminOrderDetail /></AdminRoute>} />
            <Route path="/admin/user" element={<AdminRoute><AdminUsers /></AdminRoute>} />
            <Route path="/admin/voucher" element={<AdminRoute><AdminVouchers /></AdminRoute>} />
            <Route path="/admin/review" element={<AdminRoute><AdminReviews /></AdminRoute>} />
            <Route path="/admin/support" element={<AdminRoute><AdminSupport /></AdminRoute>} />
            <Route path="/admin/maintenance" element={<AdminRoute><AdminMaintenance /></AdminRoute>} />
            <Route path="/admin/audit" element={<AdminRoute><AdminAuditLogs /></AdminRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AppShell>
    </AppProviders>
  );
}

function NotFound() {
  return (
    <div className="max-w-xl mx-auto text-center py-16 sm:py-20 animate-fade-in">
      <div className="relative inline-block">
        <div
          className="text-[120px] sm:text-[160px] font-black leading-none tracking-tighter bg-gradient-to-br from-[var(--color-aurora-1)] via-[var(--color-aurora-2)] to-[var(--color-aurora-3)] bg-clip-text text-transparent select-none"
          style={{ fontFamily: "var(--font-display)" }}
        >
          404
        </div>
        <div className="absolute -top-2 -right-4 size-12 rounded-full bg-[var(--color-brand-500)]/10 blur-xl" />
      </div>
      <h1 className="text-2xl sm:text-3xl font-extrabold mt-2 text-[var(--color-ink)]">
        Halaman tidak ditemukan
      </h1>
      <p className="text-[var(--color-ink-2)] mt-2">
        Sepertinya kamu nyasar. Halaman ini mungkin sudah dipindah atau dihapus.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link to="/" className="btn-primary">Kembali ke beranda</Link>
        <Link to="/katalog" className="btn-outline">Telusuri katalog</Link>
        <Link to="/akun/pesanan" className="btn-ghost">Pesanan saya</Link>
      </div>
      <p className="text-xs text-[var(--color-ink-3)] mt-8">
        Butuh bantuan? Buka menu Bantuan di halaman akun kamu.
      </p>
    </div>
  );
}
