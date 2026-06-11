import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus, AtSign, Mail, User as UserIcon, Lock, Eye, EyeOff, CheckCircle2, Circle } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../state/AppProviders";
import { useToast } from "../components/Toast";
import { Button } from "../components/Button";
import { Alert } from "../components/Alert";
import { useShake } from "../lib/hooks";

export default function RegisterPage() {
  const [form, setForm] = useState({ username: "", email: "", password: "", displayName: "" });
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  const { refreshBoot } = useApp();
  const toast = useToast();
  const { ref: cardRef, shake } = useShake<HTMLDivElement>();

  const passOk = form.password.length >= 8;
  const userOk = /^[a-zA-Z0-9_.\-]{3,24}$/.test(form.username);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!userOk) {
      setErr("Username harus 3–24 karakter dan hanya huruf, angka, titik, garis bawah, atau strip.");
      shake();
      return;
    }
    if (!passOk) {
      setErr("Password minimal 8 karakter.");
      shake();
      return;
    }
    setBusy(true);
    try {
      await api("/auth/register", { body: form });
      await api("/auth/login", { body: { username: form.username, password: form.password } });
      await refreshBoot();
      toast.success("Akun berhasil dibuat. Selamat datang!");
      nav("/", { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? "Gagal mendaftar. Coba lagi.");
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
            <UserPlus size={20} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]">
              Daftar akun baru
            </h1>
            <p className="text-sm text-[var(--color-ink-2)]">
              Sudah punya akun?{" "}
              <Link to="/login" className="text-[var(--color-brand-700)] font-semibold hover:underline">
                Masuk
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
          <Field label="Username" icon={AtSign}>
            <input
              className="input !pl-9"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              minLength={3}
              maxLength={24}
              pattern="[a-zA-Z0-9_.\-]+"
              placeholder="3–24 karakter"
              autoComplete="username"
            />
          </Field>

          <Field label="Email" icon={Mail}>
            <input
              className="input !pl-9"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              autoComplete="email"
            />
          </Field>

          <Field label="Nama tampilan (opsional)" icon={UserIcon}>
            <input
              className="input !pl-9"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              maxLength={60}
            />
          </Field>

          <div>
            <label className="label" htmlFor="reg-pass">Password</label>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] pointer-events-none"
              />
              <input
                id="reg-pass"
                className="input !pl-9 !pr-10"
                type={showPass ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
                autoComplete="new-password"
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
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <Requirement ok={passOk}>Minimal 8 karakter</Requirement>
              <Requirement ok={userOk}>Username valid (huruf/angka/_.-)</Requirement>
            </div>
          </div>

          <Button type="submit" icon={UserPlus} loading={busy} block size="lg">
            {busy ? "Memproses…" : "Daftar sekarang"}
          </Button>
          <p className="text-center text-xs text-[var(--color-ink-3)]">
            Dengan mendaftar kamu setuju menggunakan layanan ini sesuai kebijakan toko.
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <Icon
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] pointer-events-none"
        />
        {children}
      </div>
    </div>
  );
}

function Requirement({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : Circle;
  return (
    <span
      className={
        "inline-flex items-center gap-1 " +
        (ok ? "text-[var(--color-success)]" : "text-[var(--color-ink-3)]")
      }
    >
      <Icon size={12} />
      {children}
    </span>
  );
}
