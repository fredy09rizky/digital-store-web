import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export interface AdminInfo {
  id: string;
  username: string;
}

interface AdminMeResp {
  admin: AdminInfo;
}

// Penanda apakah admin pernah terautentikasi pada sesi app ini. Dipakai
// SessionWatcher agar popup "sesi habis" tidak muncul untuk tamu yang baru
// membuka URL admin (mereka cukup diarahkan ke halaman login).
let adminEverAuthed = false;
export function markAdminAuthed(v: boolean) {
  adminEverAuthed = v;
}
export function wasAdminAuthed(): boolean {
  return adminEverAuthed;
}

export function useAdminSession() {
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api<AdminMeResp>("/admin/auth/me")
      .then((r) => {
        setAdmin(r.admin);
        markAdminAuthed(true);
      })
      .catch(() => setAdmin(null))
      .finally(() => setReady(true));
  }, []);
  return { admin, ready, setAdmin };
}

export async function adminConfirmPassword(password: string): Promise<string> {
  const r = await api<{ ack: string }>("/admin/auth/confirm-password", { body: { password } });
  return r.ack;
}
