import { Navigate, useLocation } from "react-router-dom";
import { useApp } from "./AppProviders";
import { useAdminSession } from "../pages/admin/admin-session";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { boot } = useApp();
  const loc = useLocation();
  if (!boot) return null;
  if (!boot.user) {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { admin, ready } = useAdminSession();
  if (!ready) return null;
  if (!admin) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}
