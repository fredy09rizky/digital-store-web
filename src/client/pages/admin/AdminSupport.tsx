import { useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  Headset,
  Send,
  Download,
  Lock,
  XCircle,
  ArrowLeft,
} from "lucide-react";
import { api } from "../../lib/api";
import { dateID, relativeID } from "../../lib/format";
import { useToast } from "../../components/Toast";
import { Button, IconButton } from "../../components/Button";
import { Empty } from "../../components/Empty";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface ChatItem {
  id: string;
  status: string;
  username: string;
  code: string;
  unread_admin: number;
  updated_at: number;
}

interface MsgRow {
  id: string;
  sender_kind: string;
  body: string;
  created_at: number;
}

export default function AdminSupport() {
  const [list, setList] = useState<ChatItem[]>([]);
  const [status, setStatus] = useState<"open" | "closed">("open");
  const [active, setActive] = useState<ChatItem | null>(null);
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toast = useToast();

  async function loadList() {
    setList(await api<ChatItem[]>(`/admin/support/?status=${status}`));
  }
  async function loadActive(id: string) {
    const r = await api<{ chat: ChatItem; messages: MsgRow[] }>(`/admin/support/${id}`);
    setMessages(r.messages);
  }
  useEffect(() => {
    loadList();
  }, [status]);
  useEffect(() => {
    if (active) loadActive(active.id);
    const t = active ? setInterval(() => loadActive(active.id), 5000) : null;
    return () => {
      if (t) clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages.length]);

  async function send() {
    if (!active || !text.trim() || busy) return;
    setBusy(true);
    try {
      await api(`/admin/support/${active.id}/send`, { body: { body: text.trim() } });
      setText("");
      await loadActive(active.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal kirim.");
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!active) return;
    try {
      await api(`/admin/support/${active.id}/close`, { body: {} });
      toast.success("Chat ditutup. Riwayat dihapus.");
      setConfirmClose(false);
      setActive(null);
      loadList();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal menutup chat.");
      throw e;
    }
  }

  function downloadLog() {
    if (!active) return;
    window.open(`/api/admin/support/${active.id}/log.csv`, "_blank");
  }

  function openChat(c: ChatItem) {
    setActive(c);
    setShowMobileChat(true);
  }

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-3 h-[calc(100vh-7rem)] min-h-[480px]">
      {/* Chat list */}
      <aside
        className={
          "card flex flex-col overflow-hidden " +
          (showMobileChat ? "hidden lg:flex" : "flex")
        }
      >
        <div className="p-3 border-b border-[var(--color-border)] flex gap-2 bg-[var(--color-surface)]">
          <select
            className="select-input !w-full !py-2 !text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <div className="p-4 text-sm text-[var(--color-ink-2)] text-center">
              Tidak ada chat {status}.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {list.map((c) => {
                const isActive = active?.id === c.id;
                return (
                  <li key={c.id}>
                    <button
                      className={
                        "w-full text-left p-3 transition flex items-center gap-3 " +
                        (isActive
                          ? "bg-[var(--color-surface-tint)]"
                          : "hover:bg-[var(--color-surface-soft)]")
                      }
                      onClick={() => openChat(c)}
                    >
                      <div className="size-9 rounded-full bg-[var(--color-brand-500)] grid place-items-center text-white text-sm font-extrabold shrink-0">
                        {c.username.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-bold text-sm text-[var(--color-ink)] truncate">
                            @{c.username}
                          </div>
                          {c.unread_admin > 0 && (
                            <span className="badge-promo !text-[10px]">{c.unread_admin}</span>
                          )}
                        </div>
                        <div
                          className="text-[11px] text-[var(--color-ink-3)] font-mono truncate"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {c.code}
                        </div>
                        <div className="text-[10px] text-[var(--color-ink-3)] mt-0.5">
                          {relativeID(c.updated_at)}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Chat panel */}
      <main
        className={
          "card flex flex-col overflow-hidden " +
          (!showMobileChat ? "hidden lg:flex" : "flex")
        }
      >
        {!active ? (
          <div className="flex-1 grid place-items-center p-6">
            <Empty
              icon={MessageCircle}
              title="Pilih chat dari daftar"
              hint="Daftar chat support dengan unread badge tampil di sebelah kiri."
            />
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-2 bg-[var(--color-surface)]">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  className="lg:hidden size-8 rounded-md grid place-items-center text-[var(--color-ink-3)] hover:text-[var(--color-brand-700)] hover:bg-[var(--color-surface-soft)]"
                  onClick={() => setShowMobileChat(false)}
                  aria-label="Kembali ke daftar"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="size-9 rounded-full bg-[var(--color-surface-tint)] grid place-items-center text-[var(--color-brand-700)] shrink-0">
                  <Headset size={16} />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm text-[var(--color-ink)] truncate">
                    @{active.username}
                    <span
                      className="ml-2 text-[var(--color-ink-3)] font-mono font-normal"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {active.code}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--color-ink-2)] inline-flex items-center gap-1">
                    {active.status === "open" ? (
                      <>
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        Open
                      </>
                    ) : (
                      <>
                        <Lock size={11} /> Closed
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <IconButton icon={Download} label="Unduh log CSV" onClick={downloadLog} />
                {active.status === "open" && (
                  <Button
                    size="sm"
                    variant="danger"
                    icon={XCircle}
                    onClick={() => setConfirmClose(true)}
                  >
                    Tutup
                  </Button>
                )}
              </div>
            </div>
            <div
              ref={ref}
              className="flex-1 overflow-y-auto p-4 space-y-3 bg-[var(--color-surface-soft)]"
            >
              {messages.length === 0 ? (
                <div className="text-center text-sm text-[var(--color-ink-2)] py-8">
                  Belum ada pesan di chat ini.
                </div>
              ) : (
                messages.map((m) => <Bubble key={m.id} m={m} />)
              )}
            </div>
            <div className="border-t border-[var(--color-border)] p-2.5 bg-[var(--color-surface)]">
              {active.status === "closed" ? (
                <div className="text-center text-xs text-[var(--color-ink-2)] py-2 inline-flex items-center justify-center gap-1.5 w-full">
                  <Lock size={12} /> Chat sudah ditutup. Tidak bisa membalas.
                </div>
              ) : (
                <div className="flex gap-2 items-end">
                  <textarea
                    rows={1}
                    className="textarea !min-h-[40px] flex-1 !py-2.5 resize-none"
                    placeholder="Tulis balasan…"
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
                    aria-label="Kirim"
                  >
                    <Send size={16} />
                    <span className="hidden sm:inline">Kirim</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <ConfirmDialog
        open={confirmClose}
        title="Tutup chat support?"
        tone="danger"
        icon={XCircle}
        confirmLabel="Tutup & hapus riwayat"
        description={
          <>
            Sesi chat akan ditandai <span className="font-semibold">closed</span> dan{" "}
            <span className="font-semibold">seluruh riwayat pesan</span> di chat ini akan dihapus
            permanen. User akan melihat satu pesan sistem yang menjelaskan bahwa riwayat sudah
            dibersihkan.
            <div className="mt-2 text-[var(--color-ink-3)]">
              Tindakan tidak dapat dibatalkan.
            </div>
          </>
        }
        onClose={() => setConfirmClose(false)}
        onConfirm={close}
      />
    </div>
  );
}

function Bubble({ m }: { m: MsgRow }) {
  if (m.sender_kind === "system") {
    return (
      <div className="text-center">
        <div className="inline-block text-[11px] text-[var(--color-ink-3)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full px-3 py-1">
          {m.body}
        </div>
      </div>
    );
  }
  const isAdmin = m.sender_kind === "admin";
  return (
    <div className={"flex " + (isAdmin ? "justify-end" : "justify-start")}>
      <div
        className={
          "max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-snug shadow-sm " +
          (isAdmin
            ? "bg-[var(--color-brand-500)] text-white rounded-tr-sm"
            : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] rounded-tl-sm")
        }
      >
        <div className="whitespace-pre-line">{m.body}</div>
        <div
          className={
            "text-[10px] mt-1 " + (isAdmin ? "text-white" : "text-[var(--color-ink-3)]")
          }
        >
          {dateID(m.created_at)}
        </div>
      </div>
    </div>
  );
}
