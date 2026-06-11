import type { ApiResponse } from "@shared/types";

const BASE = "/api";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ReqOpts {
  method?: string;
  body?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  raw?: boolean;
}

// ============================================================
//  Handler sesi kedaluwarsa (global).
// ============================================================
// Saat backend membalas 401 dengan kode sesi (bukan kegagalan login biasa),
// kita panggil handler ini supaya UI bisa menampilkan popup + redirect ke
// halaman login. Hanya kode berikut yang dianggap "sesi habis".
export type SessionExpiredKind = "user" | "admin";
let sessionExpiredHandler: ((kind: SessionExpiredKind) => void) | null = null;
export function setSessionExpiredHandler(fn: ((kind: SessionExpiredKind) => void) | null) {
  sessionExpiredHandler = fn;
}

export async function api<T = unknown>(path: string, opts: ReqOpts = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
    credentials: "include",
    signal: opts.signal,
  });
  if (opts.raw) return res as unknown as T;
  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(res.status, "non_json", "Respon server tidak valid.");
  }
  if (!json.ok) {
    // Deteksi sesi habis: backend memakai kode `unauthenticated` (user) dan
    // `unauthenticated_admin` (admin). Kegagalan login (invalid_credentials,
    // dll) TIDAK termasuk, jadi popup tidak salah muncul saat salah password.
    if (res.status === 401) {
      if (json.error.code === "unauthenticated") sessionExpiredHandler?.("user");
      else if (json.error.code === "unauthenticated_admin") sessionExpiredHandler?.("admin");
    }
    throw new ApiError(res.status, json.error.code, json.error.message, json.error.details);
  }
  return json.data;
}
