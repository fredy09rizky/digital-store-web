export type PaymentProviderName = "pakasir" | "manual_bank" | "wallet";

export interface CreatePaymentInput {
  orderId: string;
  orderCode: string;
  amountCents: number;
  method: "qris" | "bank_transfer" | "wallet";
  customer: { id: string; email: string; username: string };
  expiresInSeconds: number;
}

export interface CreatePaymentResult {
  provider: PaymentProviderName;
  externalId: string | null;
  qrPayload: string | null;
  bankInfo?: { name: string; account: string; holder: string };
  raw?: unknown;
}

export type PaymentStatus = "pending" | "success" | "failed" | "expired";

export interface CheckPaymentResult {
  status: PaymentStatus;
  raw?: unknown;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  create(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  check(externalId: string | null, orderCode: string, amount?: number): Promise<CheckPaymentResult>;
}
