// Pakasir payment gateway - QRIS only.
//
// Aplikasi ini *hanya* menggunakan QRIS via Pakasir. Tidak ada VA atau metode
// lain via Pakasir. Untuk pembayaran transfer bank, sistem tidak melalui
// Pakasir, melainkan dicatat manual oleh admin (lihat manual-bank flow).
//
// Endpoint Pakasir yang dipakai (referensi resmi: https://pakasir.com/p/docs):
//   - POST  https://app.pakasir.com/api/transactioncreate/qris
//   - GET   https://app.pakasir.com/api/transactiondetail
//   - POST  https://app.pakasir.com/api/paymentsimulation         (sandbox)
//   - POST  https://app.pakasir.com/api/transactioncancel
//
// Catatan penting:
//   - Pakasir menambah biaya gateway. `total_payment` adalah jumlah yang
//     user bayar; `amount` adalah nominal yang merchant terima. Sistem
//     menampilkan `total_payment` ke user agar transparan.
//   - QR string ada di field `payment_number`. Frontend mengubahnya jadi
//     gambar QR via library QR.
//   - Untuk `transactiondetail`, `amount` yang dikirim harus persis sama
//     dengan yang dipakai saat `transactioncreate`.

import type {
  CheckPaymentResult,
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
} from "./types";

interface PakasirEnv {
  apiKey: string;
  project: string;
}

interface PakasirCreateResp {
  payment?: {
    project: string;
    order_id: string;
    amount: number;
    fee: number;
    total_payment: number;
    payment_method: string;
    payment_number: string;
    expired_at: string;
  };
  error?: string;
  message?: string;
}

interface PakasirDetailResp {
  transaction?: {
    project: string;
    order_id: string;
    amount: number;
    status: string; // pending | completed | expired | failed | cancelled
    payment_method: string;
    completed_at?: string;
  };
  error?: string;
  message?: string;
}

const BASE = "https://app.pakasir.com";

export class PakasirPaymentProvider implements PaymentProvider {
  readonly name = "pakasir" as const;

  constructor(private env: PakasirEnv) {}

  /**
   * Buat transaksi QRIS Pakasir. Return QR string + total_payment + fee.
   */
  async create(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (input.method !== "qris") {
      throw new Error("Pakasir provider hanya menangani metode QRIS.");
    }

    const url = `${BASE}/api/transactioncreate/qris`;
    const body = {
      project: this.env.project,
      order_id: input.orderCode,
      amount: input.amountCents,
      api_key: this.env.apiKey,
    };
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let json: PakasirCreateResp;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Pakasir respons tidak valid (${r.status}): ${text.slice(0, 200)}`);
    }
    if (!r.ok || !json.payment) {
      throw new Error(json.error || json.message || `Pakasir HTTP ${r.status}: ${text.slice(0, 200)}`);
    }

    const p = json.payment;
    const expiresAt = Math.floor(new Date(p.expired_at).getTime() / 1000);

    return {
      provider: "pakasir",
      externalId: p.order_id,
      qrPayload: p.payment_number,
      raw: {
        amount: p.amount,
        fee: p.fee,
        totalPayment: p.total_payment,
        expiresAt,
        paymentMethod: p.payment_method,
      },
    };
  }

  /**
   * Cek status transaksi via Pakasir. Memerlukan amount yang sama dengan
   * saat transactioncreate.
   */
  async check(externalId: string | null, _orderCode: string, amount?: number): Promise<CheckPaymentResult> {
    if (!externalId || !amount) return { status: "pending" };
    const usp = new URLSearchParams({
      project: this.env.project,
      amount: String(amount),
      order_id: externalId,
      api_key: this.env.apiKey,
    });
    const r = await fetch(`${BASE}/api/transactiondetail?${usp.toString()}`);
    if (!r.ok) return { status: "pending" };
    let json: PakasirDetailResp;
    try {
      json = (await r.json()) as PakasirDetailResp;
    } catch {
      return { status: "pending" };
    }
    if (!json.transaction) return { status: "pending" };
    return {
      status: mapStatus(json.transaction.status),
      raw: json.transaction,
    };
  }

  /** Sandbox helper: simulasikan pembayaran sukses. */
  async simulatePayment(orderCode: string, amount: number): Promise<{ ok: boolean; raw: unknown }> {
    const r = await fetch(`${BASE}/api/paymentsimulation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: this.env.project,
        order_id: orderCode,
        amount,
        api_key: this.env.apiKey,
      }),
    });
    const text = await r.text();
    return { ok: r.ok, raw: text };
  }

  /** Batalkan transaksi yang masih pending di Pakasir. */
  async cancel(orderCode: string, amount: number): Promise<{ ok: boolean; raw: unknown }> {
    const r = await fetch(`${BASE}/api/transactioncancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: this.env.project,
        order_id: orderCode,
        amount,
        api_key: this.env.apiKey,
      }),
    });
    const text = await r.text();
    return { ok: r.ok, raw: text };
  }
}

function mapStatus(s: string): "pending" | "success" | "failed" | "expired" {
  const v = (s || "").toLowerCase();
  if (v === "completed" || v === "success" || v === "paid") return "success";
  if (v === "expired") return "expired";
  if (v === "failed" || v === "cancelled" || v === "canceled") return "failed";
  return "pending";
}
