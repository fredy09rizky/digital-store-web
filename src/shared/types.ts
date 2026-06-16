// ============================================================
//  Tipe yang dipakai bersama oleh client & worker.
// ============================================================

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiError = { ok: false; error: { code: string; message: string; details?: unknown } };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PublicCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
}

export interface PublicProductBadge {
  id: string;
  label: string;
}

export interface PublicProductSummary {
  id: string;
  sku: string;
  slug: string;
  name: string;
  thumbnailUrl: string | null;
  category: { id: string; slug: string; name: string };
  priceCents: number;
  salePriceCents: number | null;
  effectivePriceCents: number;
  durationLabel: string | null;
  stock: number;
  isReady: boolean;
  ratingAvg: number;
  ratingCount: number;
  salesCount: number;
  createdAt: number;
}

export interface PublicProductDetail extends PublicProductSummary {
  description: string;
  images: { id: string; url: string }[];
  warrantyNote: string | null;
  priceTiers: { minQty: number; unitPriceCents: number }[];
}

export interface PublicReview {
  id: string;
  rating: number;
  comment: string;
  username: string;
  createdAt: number;
}

export interface CartItemView {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  thumbnailUrl: string | null;
  qty: number;
  unitPriceCents: number;
  effectiveUnitPriceCents: number;
  subtotalCents: number;
  stockAvailable: number;
}

export interface CartView {
  items: CartItemView[];
  subtotalCents: number;
  discountCents: number;
  serviceFeeCents: number;
  totalCents: number;
  voucher: { code: string; discountCents: number } | null;
}

export interface UserSelfProfile {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  balanceCents: number;
  createdAt: number;
}

export type OrderStatus = "pending_payment" | "paid" | "expired" | "cancelled" | "refunded";
export type PaymentMethod = "qris" | "bank_transfer" | "wallet";

export interface OrderListItem {
  id: string;
  code: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: number;
  expiresAt: number;
  paidAt: number | null;
  paymentMethod: PaymentMethod;
  itemCount: number;
}

export interface DeliveredItem {
  id: string;
  productName: string;
  // Konten stok dikirim apa adanya (verbatim). Stok kini selalu format bebas.
  content: string;
}

export interface OrderDetail {
  id: string;
  code: string;
  status: OrderStatus;
  kind: "purchase" | "topup";
  paymentMethod: PaymentMethod;
  subtotalCents: number;
  discountCents: number;
  serviceFeeCents: number;
  totalCents: number;
  voucherCode: string | null;
  expiresAt: number;
  paidAt: number | null;
  createdAt: number;
  notes: string | null;
  items: {
    id: string;
    productId: string;
    productName: string;
    qty: number;
    unitPriceCents: number;
    subtotalCents: number;
  }[];
  payment: {
    provider: string;
    method: PaymentMethod;
    status: string;
    qrPayload: string | null;
    bankName: string | null;
    bankAccount: string | null;
    bankHolder: string | null;
    proofUrl: string | null;
    displayAmountCents: number;
    feeCents: number;
    expiresAtProvider: number | null;
  } | null;
  deliveredItems: DeliveredItem[];
  refundChat: { id: string; status: string } | null;
  refundRequestedAt: number | null;
  reviewable: { productId: string; productName: string; reviewed: boolean }[];
}

export interface MaintenanceState {
  active: boolean;
  message: string;
}
