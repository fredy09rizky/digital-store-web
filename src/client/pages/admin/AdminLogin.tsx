import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  AtSign,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Send,
  RotateCw,
  KeyRound,
  AlertTriangle,
} from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { Button } from "../../components/Button";
import { Alert } from "../../components/Alert";

export default function AdminLogin() {
  const [step, setStep] = useState<"creds" | "otp">("creds");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [ticket, setTicket] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [resendCd, setResendCd] = useState(0);
  const toast = useToast();
  const nav = useNavigate();

  useEffect(() => {
    if (step !== "otp" || resendCd <= 0) return;
    const t = setInterval(() => setResendCd((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, [step, resendCd]);

  async function startLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ ticket: string; telegramSent: boolean; telegramHint: string | null }>(
        "/admin/auth/start-login",
        { body: { username, password } },
      );
      setTicket(r.ticket);
      setHint(r.telegramSent ? null : r.telegramHint);
      setStep("otp");
      setResendCd(120);
    } catch (e: any) {
      setErr(e?.message ?? "Username atau password admin salah.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/admin/auth/verify-otp", { body: { ticket, code } });
      toast.success("Login admin berhasil.");
      nav("/admin", { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? "OTP tidak valid atau kedaluwarsa.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (resendCd > 0) return;
    setErr(null);
    try {
      await api("/admin/auth/resend-otp", { body: { ticket } });
      toast.success("OTP baru dikirim.");
      setResendCd(120);
      setCode("");
    } catch (e: any) {
      setErr(e?.message ?? "Gagal kirim ulang OTP.");
    }
  }

  return (
    <div className="card p-6 sm:p-8 w-full max-w-md animate-scale-in">
      <div className="flex items-center gap-3 mb-1">
        <div className="size-12 rounded-xl bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-accent-500)] grid place-items-center text-white">
          <ShieldCheck size={22} />
        </div>
        <div>
          <div
            className="font-extrabold text-xl text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Admin Panel
          </div>
          <div className="text-xs text-[var(--color-ink-3)]">
            {step === "creds" ? "Verifikasi kredensial admin" : "Verifikasi OTP via Telegram"}
          </div>
        </div>
      </div>

      {err && (
        <div className="mt-5">
          <Alert tone="error" onClose={() => setErr(null)}>
            {err}
          </Alert>
        </div>
      )}

      {step === "creds" ? (
        <form onSubmit={startLogin} className="space-y-4 mt-6">
          <div>
            <label className="label">Username admin</label>
            <div className="relative">
              <AtSign
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] pointer-events-none"
              />
              <input
                className="input !pl-9"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
          </div>
          <div>
            <label className="label">Password</label>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] pointer-events-none"
              />
              <input
                className="input !pl-9 !pr-10"
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-md grid place-items-center text-[var(--color-ink-3)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)]"
                aria-label={showPass ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <Button type="submit" iconRight={ArrowRight} block size="lg" loading={busy}>
            Lanjut ke OTP
          </Button>
          <p className="text-xs text-[var(--color-ink-3)] text-center inline-flex items-center justify-center gap-1.5 w-full">
            <Send size={12} /> OTP 6 digit dikirim via Telegram bot.
          </p>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4 mt-6">
          {hint && (
            <div className="rounded-lg bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] border border-[color-mix(in_srgb,var(--color-warning)_32%,transparent)] text-[var(--color-warning)] text-xs p-3 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-bold">Telegram tidak terkirim</div>
                <div>
                  {hint}. Pastikan <code>TELEGRAM_BOT_TOKEN</code> dan{" "}
                  <code>TELEGRAM_CHAT_ID</code> terisi (saat dev OTP juga di-log ke konsol).
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="label inline-flex items-center gap-1.5">
              <KeyRound size={14} /> Kode OTP (6 digit)
            </label>
            <input
              className="input !text-center !text-2xl !tracking-[0.5em] !font-bold !py-3"
              inputMode="numeric"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              autoFocus
              style={{ fontFamily: "var(--font-ui)" }}
            />
          </div>
          <Button
            type="submit"
            icon={ShieldCheck}
            block
            size="lg"
            loading={busy}
            disabled={code.length !== 6}
          >
            {busy ? "Memverifikasi…" : "Verifikasi & masuk"}
          </Button>
          <Button
            type="button"
            variant="outline"
            icon={RotateCw}
            block
            onClick={resend}
            disabled={resendCd > 0}
          >
            {resendCd > 0 ? `Kirim ulang dalam ${resendCd}s` : "Kirim ulang OTP"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep("creds");
              setErr(null);
            }}
            className="block w-full text-xs text-[var(--color-ink-3)] hover:text-[var(--color-ink)] mt-2"
          >
            ← Ganti username/password
          </button>
        </form>
      )}
    </div>
  );
}
