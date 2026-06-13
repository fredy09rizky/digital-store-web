import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus, AtSign, Mail, User as UserIcon, Lock, Eye, EyeOff, CheckCircle2, Circle } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../state/AppProviders";
import { useToast } from "../components/Toast";
import { Button } from "../components/Button";
import { Alert } from "../components/Alert";
import { useShake } from "../lib/hooks";
import {
  validateUsername,
  validateEmail,
  validatePassword,
  validateDisplayName,
  USERNAME_MIN,
  USERNAME_MAX,
  DISPLAY_NAME_MAX,
  PASSWORD_MIN,
  PASSWORD_MAX,
} from "@shared/constants";

export default function RegisterPage() {
  const [form, setForm] = useState({ username: "", email: "", password: "", displayName: "" });
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  const { refreshBoot } = useApp();
  const toast = useToast();
  const { ref: cardRef, shake } = useShake<HTMLDivElement>();

  // Indikator live untuk checklist syarat.
  const userValid = validateUsername(form.username) === null;
  const emailValid = validateEmail(form.email) === null;
  const pwLen = form.password.length >= PASSWORD_MIN && form.password.length <= PASSWORD_MAX;
  const pwCase = /[a-z]/.test(form.password) && /[A-Z]/.test(form.password);
  const pwDigit = /[0-9]/.test(form.password);
  const pwSymbol = /[@!#$%&*]/.test(form.password);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    // Validasi klien memakai aturan yang sama dengan backend, agar pesannya
    // konsisten dan spesifik. Backend tetap memvalidasi ulang.
    const firstErr =
      validateUsername(form.username) ||
      validateEmail(form.email) ||
      validatePassword(form.password) ||
      (form.displayName ? validateDisplayName(form.displayName) : null);
    if (firstErr) {
      setErr(firstErr);
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
              minLength={USERNAME_MIN}
              maxLength={USERNAME_MAX}
              pattern="[a-zA-Z0-9_]+"
              placeholder={`${USERNAME_MIN}–${USERNAME_MAX} karakter (huruf, angka, _)`}
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
              placeholder="Gmail, Outlook/Hotmail, Yahoo, iCloud, Proton"
              autoComplete="email"
            />
          </Field>

          <Field label="Nama tampilan (opsional)" icon={UserIcon}>
            <input
              className="input !pl-9"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              maxLength={DISPLAY_NAME_MAX}
              placeholder={`Maks ${DISPLAY_NAME_MAX} karakter`}
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
                minLength={PASSWORD_MIN}
                maxLength={PASSWORD_MAX}
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
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-xs">
              <Requirement ok={userValid}>Username {USERNAME_MIN}–{USERNAME_MAX} (huruf, angka, _)</Requirement>
              <Requirement ok={emailValid}>Email domain didukung</Requirement>
              <Requirement ok={pwLen}>Password min {PASSWORD_MIN} karakter</Requirement>
              <Requirement ok={pwCase}>Huruf besar &amp; kecil</Requirement>
              <Requirement ok={pwDigit}>Angka</Requirement>
              <Requirement ok={pwSymbol}>Simbol @ ! # $ % &amp; *</Requirement>
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
