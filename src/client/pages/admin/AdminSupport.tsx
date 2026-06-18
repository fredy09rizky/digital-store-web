import { useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  Headset,
  Send,
  Download,
  Lock,
  XCircle,
  ArrowLeft,
  Search,
  RotateCcw,
  LifeBuoy,
} from "lucide-react";
import { api } from "../../lib/api";
import { dateID, relativeID } from "../../lib/format";
import { useToast } from "../../components/Toast";
import { Button, IconButton } from "../../components/Button";
import { Empty } from "../../components/Empty";
import { Pagination } from "../../components/Pagination";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface ChatItem {
  id: string;
  kind: "refund" | "support";
  status: string;
  username: string;
  code: string | null;
  unread_admin: number;
  updated_at: number;
}

interface ChatDetail {
  id: string;
  kind: "refund" | "support";
  status: string;
  username: string;
  code: string | null;
}

interface MsgRow {
  id: string;
  sender_kind: string;
  body: string;
  created_at: number;
}

interface PageResp {
  items: ChatItem[];
  page: number;
  pageSize: number;
  total: number;
}

const PAGE_SIZE = 30;

/**
 * Sisipkan newline di posisi kursor textarea (untuk Ctrl/Cmd+Enter, yang tidak
 * menambah baris baru secara default di browser).
 */
function insertNewlineAtCursor(el: HTMLTextAreaElement, setText: (v: string) => void) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = (el.value.slice(0, start) + "\n" + el.value.slice(end)).slice(0, 1000);
  setText(next);
  requestAnimationFrame(() => {
    try {
      el.selectionStart = el.selectionEnd = start + 1;
    } catch {
      /* noop */
    }
  });
}

export default function AdminSupport() {
  const [list, setList] = useState<ChatItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"open" | "closed">("open");
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<ChatDetail | null>(null);
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();

  async function loadList() {
    const params = new URLSearchParams({
      status,
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (q.trim()) params.set("q", q.trim());
    const r = await api<PageResp>(`/admin/support/?${params.toString()}`);
    setList(r.items);
    setTotal(r.total);
  }
  async function loadActive(id: string) {
    const r = await api<{ chat: ChatDetail; messages: MsgRow[] }>(`/admin/support/${id}`);
    setActiveChat(r.chat);
    setMessages(r.messages);
  }

  // Reset ke halaman 1 saat ganti filter/search (debounce search).
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q, status]);

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page, q]);

  useEffect(() => {
    if (activeId) loadActive(activeId);
    const t = activeId ? setInterval(() => loadActive(activeId), 5000) : null;
    return () => {
      if (t) clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages.length]);

  // Auto-grow textarea balasan admin, dibatasi tinggi maksimum.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [text]);

  async function send() {
    if (!activeId || !text.trim() || busy) return;
    setBusy(true);
    try {
      await api(`/admin/support/${activeId}/send`, { body: { body: text.trim() } });
      setText("");
      await loadActive(activeId);
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal kirim.");
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!activeId) return;
    try {
      await api(`/admin/support/${activeId}/close`, { body: {} });
      toast.success("Chat ditutup. Riwayat dihapus otomatis sesuai retensi.");
      setConfirmClose(false);
      await loadActive(activeId);
      loadList();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal menutup chat.");
      throw e;
    }
  }

  function downloadLog() {
    if (!activeId) return;
    window.open(`/api/admin/support/${activeId}/log.csv`, "_blank");
  }

  function openChat(c: ChatItem) {
    setActiveId(c.id);
    setShowMobileChat(true);
  }

  function chatLabel(c: { kind: string; code: string | null }): string {
    return c.kind === "refund" ? `Refund · ${c.code ?? "-"}` : "Support umum";
  }

  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-3 h-[calc(100vh-7rem)] min-h-[480px]">
      {/* Chat list */}
      <aside
        className={
          "card flex flex-col overflow-hidden " + (showMobileChat ? "hidden lg:flex" : "flex")
        }
      >
        <div className="p-3 border-b border-[var(--color-border)] space-y-2 bg-[var(--color-surface)]">
          <select
            className="select-input !w-full !py-2 !text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] pointer-events-none"
            />
            <input
              className="input !pl-9 !py-2 !text-sm"
              placeholder="Cari username atau kode order…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <div className="p-4 text-sm text-[var(--color-ink-2)] text-center">
              Tidak ada chat {status}.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {list.map((c) => {
                const isActive = activeId === c.id;
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
                      <div
                        className={
                          "size-9 rounded-full grid place-items-center text-white shrink-0 " +
                          (c.kind === "refund"
                            ? "bg-[var(--color-accent-500)]"
                            : "bg-[var(--color-brand-500)]")
                        }
                      >
                        {c.kind === "refund" ? <RotateCcw size={15} /> : <LifeBuoy size={15} />}
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
                          {chatLabel(c)}
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
        <div className="px-3 pb-2 border-t border-[var(--color-border)]">
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </div>
      </aside>

      {/* Chat panel */}
      <main
        className={
          "card flex flex-col overflow-hidden " + (!showMobileChat ? "hidden lg:flex" : "flex")
        }
      >
        {!activeId || !activeChat ? (
          <div className="flex-1 grid place-items-center p-6">
            <Empty
              icon={MessageCircle}
              title="Pilih chat dari daftar"
              hint="Daftar chat support & refund dengan unread badge tampil di sebelah kiri."
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
                    @{activeChat.username}
                    <span
                      className="ml-2 text-[var(--color-ink-3)] font-mono font-normal"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {chatLabel(activeChat)}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--color-ink-2)] inline-flex items-center gap-1">
                    {activeChat.status === "open" ? (
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
                {activeChat.status === "open" && (
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
              role="log"
              aria-live="polite"
              aria-label="Riwayat pesan"
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
              {activeChat.status === "closed" && (
                <div className="text-[11px] text-[var(--color-ink-3)] mb-2 inline-flex items-center gap-1.5">
                  <Lock size={11} /> Chat sudah ditutup. User tidak bisa membalas, tapi kamu masih
                  bisa mengirim catatan akhir.
                </div>
              )}
              <div className="flex gap-2 items-end">
                <textarea
                  ref={taRef}
                  rows={1}
                  maxLength={1000}
                  className="textarea !min-h-[40px] max-h-[140px] flex-1 !py-2.5 resize-none overflow-y-auto"
                  placeholder="Tulis balasan… (Enter kirim, Ctrl/Shift+Enter baris baru)"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (e.shiftKey) return;
                    if (e.ctrlKey || e.metaKey) {
                      e.preventDefault();
                      insertNewlineAtCursor(e.currentTarget, setText);
                      return;
                    }
                    e.preventDefault();
                    send();
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
            </div>
          </>
        )}
      </main>

      <ConfirmDialog
        open={confirmClose}
        title="Tutup chat ini?"
        tone="danger"
        icon={XCircle}
        confirmLabel="Tutup chat"
        description={
          <>
            Chat akan ditandai <span className="font-semibold">closed</span>. User tidak bisa
            membalas lagi (kamu masih bisa mengirim catatan akhir). Seluruh riwayat akan{" "}
            <span className="font-semibold">dihapus permanen otomatis</span> oleh sistem setelah masa
            retensi yang diatur di Pengaturan.
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
        <div className="whitespace-pre-line break-words">{m.body}</div>
        <div className={"text-[10px] mt-1 " + (isAdmin ? "text-white" : "text-[var(--color-ink-3)]")}>
          {dateID(m.created_at)}
        </div>
      </div>
    </div>
  );
}
