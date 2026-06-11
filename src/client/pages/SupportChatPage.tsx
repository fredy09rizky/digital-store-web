import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, MessageCircle, Send, Lock, Headset } from "lucide-react";
import { api } from "../lib/api";
import { dateID } from "../lib/format";
import { Loading } from "../components/Loading";
import { Empty } from "../components/Empty";
import { Alert } from "../components/Alert";

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
    closed_at: number | null;
    archived?: boolean;
  } | null;
  messages: MsgRow[];
}

export default function SupportChatPage() {
  const { idOrCode } = useParams();
  const [data, setData] = useState<ChatResp | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    setData(await api<ChatResp>(`/support/orders/${idOrCode}`));
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 7000);
    return () => clearInterval(t);
  }, [idOrCode]);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [data?.messages.length]);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/support/orders/${idOrCode}/send`, { body: { body: text.trim() } });
      setText("");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Pesan gagal terkirim. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Loading label="Memuat percakapan…" />;
  const closed = data.chat?.status === "closed" || data.chat?.archived;
  const noChat = !data.chat;

  return (
    <div className="card overflow-hidden flex flex-col h-[calc(100vh-9rem)] min-h-[480px]">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 border-b border-[var(--color-border)] flex items-center gap-3 bg-[var(--color-surface)]">
        <Link
          to={`/akun/pesanan/${idOrCode}`}
          className="size-8 rounded-md grid place-items-center text-[var(--color-ink-3)] hover:text-[var(--color-brand-700)] hover:bg-[var(--color-surface-soft)]"
          aria-label="Kembali"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="size-9 rounded-full bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)]">
          <Headset size={16} />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-[var(--color-ink)] text-sm sm:text-base">
            Support · {idOrCode}
          </div>
          <div className="text-[11px] text-[var(--color-ink-2)] inline-flex items-center gap-1">
            {closed ? (
              <>
                <Lock size={11} /> Sesi ditutup
              </>
            ) : (
              <>
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Aktif · admin akan membalas secepatnya
              </>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={ref}
        className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[var(--color-surface-soft)]"
      >
        {noChat ? (
          <Empty
            icon={MessageCircle}
            title="Belum ada percakapan"
            hint="Mulai chat dari kolom di bawah untuk menanyakan masalah, refund, atau penggantian akun."
          />
        ) : data.messages.length === 0 ? (
          <Empty
            icon={MessageCircle}
            title="Mulai percakapan"
            hint="Tulis pesan pertamamu di bawah."
          />
        ) : (
          data.messages.map((m) => <MsgBubble key={m.id} m={m} />)
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-[var(--color-border)] p-2.5 sm:p-3 bg-[var(--color-surface)]">
        {closed ? (
          <div className="text-center text-xs text-[var(--color-ink-2)] py-2 inline-flex items-center justify-center gap-1.5 w-full">
            <Lock size={12} /> Sesi ditutup admin. Riwayat pesan sudah dibersihkan untuk privasi.
            Buat order baru jika butuh bantuan lain.
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
                rows={1}
                className="textarea !min-h-[40px] flex-1 !py-2.5 resize-none"
                placeholder="Tulis pesan…"
                aria-label="Tulis pesan"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
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
        <div className="whitespace-pre-line">{m.body}</div>
        <div
          className={
            "text-[10px] mt-1 " + (isUser ? "text-white" : "text-[var(--color-ink-3)]")
          }
        >
          {dateID(m.created_at)}
        </div>
      </div>
    </div>
  );
}
