import type { ComponentType } from "react";
import { Clock, CheckCircle2, XCircle, Ban, RotateCcw } from "lucide-react";
import type { OrderStatus } from "@shared/types";

type Tone = { color: string; bg: string; label: string; icon: ComponentType<{ size?: number; className?: string }> };

/**
 * Sumber kebenaran tunggal untuk tampilan status order/pembayaran, dipakai
 * konsisten di orders list, order detail, payment, dan success.
 */
export const ORDER_STATUS_INFO: Record<OrderStatus, Tone> = {
  pending_payment: { color: "var(--color-warning)", bg: "color-mix(in srgb, var(--color-warning) 14%, transparent)", label: "Menunggu bayar", icon: Clock },
  paid: { color: "var(--color-success)", bg: "color-mix(in srgb, var(--color-success) 14%, transparent)", label: "Lunas", icon: CheckCircle2 },
  expired: { color: "var(--color-ink-3)", bg: "color-mix(in srgb, var(--color-ink-3) 16%, transparent)", label: "Kedaluwarsa", icon: XCircle },
  cancelled: { color: "var(--color-danger)", bg: "color-mix(in srgb, var(--color-danger) 12%, transparent)", label: "Dibatalkan", icon: Ban },
  refunded: { color: "var(--color-brand-700)", bg: "var(--color-surface-tint)", label: "Refund", icon: RotateCcw },
};

export function StatusPill({ status, className = "" }: { status: OrderStatus; className?: string }) {
  const info = ORDER_STATUS_INFO[status] ?? ORDER_STATUS_INFO.cancelled;
  const Icon = info.icon;
  return (
    <span
      className={"status-pill " + className}
      style={{ color: info.color, backgroundColor: info.bg, borderColor: "transparent" }}
    >
      <Icon size={12} />
      {info.label}
    </span>
  );
}
