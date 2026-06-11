import { Loader2 } from "lucide-react";

export function Loading({ label = "Memuat…" }: { label?: string }) {
  return (
    <div className="py-12 text-center text-[var(--color-ink-2)]">
      <div className="inline-flex items-center gap-2 animate-fade-in">
        <Loader2 size={16} className="animate-spin text-[var(--color-brand-500)]" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="card-flat overflow-hidden">
      <div className="aspect-[4/3] skeleton rounded-none" />
      <div className="p-3.5 space-y-2.5">
        <div className="h-3 w-1/3 skeleton" />
        <div className="h-4 w-4/5 skeleton" />
        <div className="h-5 w-2/5 skeleton" />
      </div>
    </div>
  );
}

export function LineSkeleton({ width = "100%" }: { width?: string }) {
  return <div className="h-4 skeleton" style={{ width }} />;
}

export function TableRowSkeleton({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c}>
              <div
                className="h-3.5 skeleton"
                style={{ width: c === 0 ? "70%" : c === cols - 1 ? "30%" : "55%" }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function ListRowSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="p-3 sm:p-4 flex items-center gap-3">
          <div className="size-12 rounded-xl skeleton shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-4 w-2/5 skeleton" />
            <div className="h-3 w-3/5 skeleton" />
          </div>
          <div className="h-8 w-16 skeleton shrink-0" />
        </li>
      ))}
    </>
  );
}

export function StatSkeleton() {
  return (
    <div className="card-flat p-4">
      <div className="flex items-center gap-2.5">
        <div className="size-9 rounded-lg skeleton" />
        <div className="h-3 w-20 skeleton" />
      </div>
      <div className="mt-3 h-7 w-24 skeleton" />
      <div className="mt-2 h-2.5 w-12 skeleton" />
    </div>
  );
}

export function ReviewCardSkeleton() {
  return (
    <article className="card p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 w-2/5 skeleton" />
          <div className="h-3 w-1/3 skeleton" />
        </div>
        <div className="h-4 w-24 skeleton" />
      </div>
      <div className="h-16 w-full skeleton" />
      <div className="flex gap-2">
        <div className="h-8 w-20 skeleton" />
        <div className="h-8 w-20 skeleton" />
        <div className="h-8 w-20 skeleton" />
      </div>
    </article>
  );
}

export function OrderRowSkeleton() {
  return (
    <li className="card p-4 flex items-center gap-3">
      <div className="size-10 rounded-lg skeleton shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-4 w-32 skeleton" />
          <div className="h-4 w-16 rounded-full skeleton" />
        </div>
        <div className="h-3 w-2/3 skeleton" />
      </div>
      <div className="space-y-1.5 shrink-0">
        <div className="h-4 w-20 skeleton ml-auto" />
        <div className="h-3 w-12 skeleton ml-auto" />
      </div>
    </li>
  );
}

export function CartItemSkeleton() {
  return (
    <li className="p-3 sm:p-4 flex gap-3 items-center">
      <div className="size-16 sm:size-20 rounded-lg skeleton shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-4 w-3/4 skeleton" />
        <div className="h-3 w-1/3 skeleton" />
      </div>
      <div className="h-9 w-32 rounded-lg skeleton shrink-0" />
      <div className="h-5 w-20 skeleton shrink-0" />
    </li>
  );
}
