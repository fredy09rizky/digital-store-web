export const APP_NAME_DEFAULT = "Pasar Premium";

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "expired",
  "cancelled",
  "refunded",
] as const;

export const PAYMENT_METHODS = ["qris", "bank_transfer", "wallet"] as const;

export const REVIEW_STATUSES = ["pending", "approved", "rejected", "spam"] as const;

export const MAX_REVIEW_IMAGES = 2;
export const MAX_REVIEW_IMAGE_BYTES = 2 * 1024 * 1024;

export const MAX_QTY_PER_ITEM = 99;
