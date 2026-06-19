import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, MessageCircle, Send, Lock, Headset } from "lucide-react";
import { api } from "../lib/api";
import { dateID } from "../lib/format";
import { Loading } from "./Loading";
import { Empty } from "./Empty";
import { Alert } from "./Alert";

const CHAT_MSG_MAX = 1000;

/**
 * Sisipkan newline di posisi kursor textarea. Dipakai untuk Ctrl/Cmd+Enter,
 * karena browser tidak menambah baris baru sendiri untuk kombinasi itu.
 */
function insertNewlineAtCursor(
  el: HTMLTextAreaElement,
  setText: (v: string) => void,
) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = (el.value.slice(0, start) + "\n" + el.value.slice(end)).slice(0, CHAT_MSG_MAX);
  setText(next);
  // Kembalikan posisi kursor tepat setelah newline pasca re-render.
  requestAnimationFrame(() => {
    try {
      el.selectionStart = el.selectionEnd = start + 1;
    } catch {
      /* noop */
    }
  });
}

interface MsgRow {
  id: string;
  sender_kind: string;
  body: string;
  attachment_url: string | null;
  created_at: number;
}
interface ChatResp {
  chat: {
    id: string;
    status: string;
    closed_at?: number | null;
  } | null;
  messages: MsgRow[];
}

/**
 * Komponen chat reusable untuk dua kanal:
 *   - Chat refund (per order): loadPath `/support/orders/:idOrCode`.
 *   - Chat support umum (level akun): loadPath `/support/general`.
 *
 * Aturan input: Enter = kirim; Shift/Ctrl/Cmd+Enter = baris baru. Maks 1000
 * karakter, emoji diizinkan. Saat chat ditutup admin, user tidak bisa kirim.
 */
export function ChatRoom({
  loadPath,
  sendPath,
  backTo,
  title,
  subtitle,
  emptyTitle,
  emptyHint,
}: {
  loadPath: string;
  sendPath: string;
  backTo: string;
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyHint: string;
}) {
  const [data, setData] = useState<ChatResp | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  async function load() {
    setData(await api<ChatResp>(loadPath));
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 7000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadPath]);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [data?.messages.length]);

  // Auto-grow textarea mengikuti jumlah baris, dibatasi tinggi maksimum.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [text]);

  async function send() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api(sendPath, { body: { body: value.slice(0, CHAT_MSG_MAX) } });
      setText("");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Pesan gagal terkirim. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Loading label="Memuat percakapan…" />;
  const closed = data.chat?.status === "closed";
  const noChat = !data.chat;

  return (
    <div className="card overflow-hidden flex flex-col h-[calc(100vh-9rem)] min-h-[480px]">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 border-b border-[var(--color-border)] flex items-center gap-3 bg-[var(--color-surface)]">
        <Link
          to={backTo}
          className="size-8 rounded-md grid place-items-center text-[var(--color-ink-3)] hover:text-[var(--color-brand-700)] hover:bg-[var(--color-surface-soft)]"
          aria-label="Kembali"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="size-9 rounded-full bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
          <Headset size={16} />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-[var(--color-ink)] text-sm sm:text-base truncate">{title}</div>
          <div className="text-[11px] text-[var(--color-ink-2)] inline-flex items-center gap-1">
            {closed ? (
              <>
                <Lock size={11} /> Ditutup · admin masih bisa membalas
              </>
            ) : (
              <>
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {subtitle}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={ref}
        role="log"
        aria-live="polite"
        aria-label="Riwayat pesan"
        className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[var(--color-surface-soft)]"
      >
        {noChat ? (
          <Empty icon={MessageCircle} title={emptyTitle} hint={emptyHint} />
        ) : data.messages.length === 0 ? (
          <Empty icon={MessageCircle} title="Mulai percakapan" hint="Tulis pesan pertamamu di bawah." />
        ) : (
          data.messages.map((m) => <MsgBubble key={m.id} m={m} />)
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-[var(--color-border)] p-2.5 sm:p-3 bg-[var(--color-surface)]">
        {closed ? (
          <div className="text-center text-xs text-[var(--color-ink-2)] py-2 flex items-center justify-center gap-1.5 w-full">
            <Lock size={12} className="shrink-0" />
            <span>
              Chat ditutup admin. Kamu tidak bisa membalas lagi, tapi admin masih bisa mengirim
              pesan terakhir (mis. solusi atau akun pengganti) — pesan baru akan muncul di sini
              otomatis. Riwayat akan dihapus otomatis oleh sistem setelah beberapa waktu.
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {err && (
              <Alert tone="error" onClose={() => setErr(null)}>
                {err}
              </Alert>
            )}
            <div className="flex gap-2 items-end">
              <textarea
                ref={taRef}
                rows={1}
                maxLength={CHAT_MSG_MAX}
                className="textarea !min-h-[40px] max-h-[140px] flex-1 !py-2.5 resize-none overflow-y-auto"
                placeholder="Tulis pesan… (Enter kirim, Ctrl/Shift+Enter baris baru)"
                aria-label="Tulis pesan"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  // Shift+Enter: biarkan textarea menyisipkan baris baru sendiri.
                  if (e.shiftKey) return;
                  // Ctrl+Enter (Windows) / Cmd+Enter (Mac): browser TIDAK
                  // menyisipkan baris baru secara default, jadi kita sisipkan
                  // manual di posisi kursor.
                  if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    insertNewlineAtCursor(e.currentTarget, setText);
                    return;
                  }
                  // Enter biasa = kirim.
                  e.preventDefault();
                  send();
                }}
              />
              <button
                onClick={send}
                disabled={busy || !text.trim()}
                className="btn-primary !min-h-[40px] !px-4 !rounded-lg"
                aria-label="Kirim pesan"
              >
                <Send size={16} />
                <span className="hidden sm:inline">Kirim</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MsgBubble({ m }: { m: MsgRow }) {
  if (m.sender_kind === "system") {
    return (
      <div className="text-center">
        <div className="inline-block text-[11px] text-[var(--color-ink-3)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full px-3 py-1">
          {m.body}
        </div>
      </div>
    );
  }
  const isUser = m.sender_kind === "user";
  return (
    <div className={"flex " + (isUser ? "justify-end" : "justify-start")}>
      <div
        className={
          "max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-snug shadow-sm " +
          (isUser
            ? "bg-[var(--color-brand-500)] text-white rounded-tr-sm"
            : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] rounded-tl-sm")
        }
      >
        <div className="whitespace-pre-line break-words">{m.body}</div>
        <div className={"text-[10px] mt-1 " + (isUser ? "text-white" : "text-[var(--color-ink-3)]")}>
          {dateID(m.created_at)}
        </div>
      </div>
    </div>
  );
}
