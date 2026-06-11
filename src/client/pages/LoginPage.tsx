import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LogIn, AtSign, Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../state/AppProviders";
import { useToast } from "../components/Toast";
import { Button } from "../components/Button";
import { Alert } from "../components/Alert";
import { useShake } from "../lib/hooks";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const nav = useNavigate();
  const { refreshBoot } = useApp();
  const toast = useToast();
  const { ref: cardRef, shake } = useShake<HTMLDivElement>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/auth/login", { body: { username: username.trim(), password } });
      await refreshBoot();
      toast.success("Selamat datang!");
      nav(next, { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? "Username atau password salah.");
      shake();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-2 sm:mt-6 animate-fade-in">
      <div className="card p-6 sm:p-8" ref={cardRef}>
        <div className="flex items-center gap-3 mb-1">
          <div className="size-10 rounded-xl bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
            <LogIn size={20} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]">
              Masuk akun
            </h1>
            <p className="text-sm text-[var(--color-ink-2)]">
              Belum punya akun?{" "}
              <Link to="/register" className="text-[var(--color-brand-700)] font-semibold hover:underline">
                Daftar dulu
              </Link>
              .
            </p>
          </div>
        </div>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          {err && (
            <Alert tone="error" onClose={() => setErr(null)}>
              {err}
            </Alert>
          )}
          <div>
            <label className="label" htmlFor="login-username">
              Username atau email
            </label>
            <div className="relative">
              <AtSign
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] pointer-events-none"
              />
              <input
                id="login-username"
                className="input !pl-9"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="login-password">
              Password
            </label>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] pointer-events-none"
              />
              <input
                id="login-password"
                className="input !pl-9 !pr-10"
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-md grid place-items-center text-[var(--color-ink-3)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)]"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <Button type="submit" icon={LogIn} loading={busy} block size="lg">
            {busy ? "Memproses…" : "Masuk"}
          </Button>

          <div className="flex items-start gap-2 text-xs text-[var(--color-ink-2)] bg-[var(--color-surface-tint)] border border-[var(--color-brand-200)] rounded-lg p-3">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[var(--color-brand-700)]" />
            <p>
              Sesi terikat ke device. Login dari perangkat lain otomatis mengeluarkan sesi sebelumnya.
              Lupa password? Hubungi admin via support chat order yang aktif.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
