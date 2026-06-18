import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Printer, Gem, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import type { OrderDetail } from "@shared/types";
import { rupiah, dateID } from "../lib/format";
import { useApp } from "../state/AppProviders";
import { Loading } from "../components/Loading";
import { Button } from "../components/Button";

export default function InvoicePage() {
  const { idOrCode } = useParams();
  const [o, setO] = useState<OrderDetail | null>(null);
  const { boot } = useApp();

  useEffect(() => {
    api<OrderDetail>(`/orders/${idOrCode}`)
      .then(setO)
      .catch(() => null);
  }, [idOrCode]);

  if (!o) return <Loading label="Memuat invoice…" />;

  const paid = o.status === "paid";

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      <div className="flex items-center justify-between no-print print:hidden">
        <Link
          to={`/akun/pesanan/${o.code}`}
          className="text-sm text-[var(--color-ink-2)] hover:text-[var(--color-brand-700)] inline-flex items-center gap-1 font-semibold"
        >
          <ArrowLeft size={14} /> Kembali ke order
        </Link>
        <Button onClick={() => window.print()} icon={Printer}>
          Cetak / Simpan PDF
        </Button>
      </div>

      <div className="invoice card overflow-hidden print:shadow-none">
        {/* Accent bar */}
        <div
          className="h-1.5 w-full"
          style={{ background: "linear-gradient(90deg, var(--color-aurora-1), var(--color-aurora-2), var(--color-aurora-3))" }}
        />

        <div className="p-6 sm:p-10">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span
                className="size-12 rounded-xl grid place-items-center text-white shrink-0"
                style={{ background: "linear-gradient(135deg, var(--color-aurora-1), var(--color-aurora-3))" }}
              >
                <Gem size={22} />
              </span>
              <div>
                <div className="font-bold text-xl text-[var(--color-ink)]" style={{ fontFamily: "var(--font-display)" }}>
                  {boot?.appName ?? "Pasar Premium"}
                </div>
                <div className="text-xs text-[var(--color-ink-3)] mt-0.5">
                  Marketplace digital · invoice elektronik
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="eyebrow text-[10px]">Invoice</div>
              <div className="font-bold text-xl text-[var(--color-ink)] tabular-nums" style={{ fontFamily: "var(--font-ui)" }}>
                {o.code}
              </div>
              <div className="text-xs text-[var(--color-ink-2)] mt-0.5">
                {dateID(o.paidAt ?? o.createdAt)}
              </div>
            </div>
          </div>

          {/* Meta strip */}
          <div className="mt-6 grid sm:grid-cols-3 gap-3">
            <MetaBox label="Pelanggan">
              <div className="font-semibold text-[var(--color-ink)]">
                {boot?.user?.displayName ? boot.user.displayName : `@${boot?.user?.username ?? ""}`}
              </div>
              <div className="text-[var(--color-ink-2)] text-xs truncate">{boot?.user?.email}</div>
            </MetaBox>
            <MetaBox label="Metode">
              <div className="font-semibold text-[var(--color-ink)] capitalize">
                {o.paymentMethod.replace("_", " ")}
              </div>
            </MetaBox>
            <MetaBox label="Status">
              <div
                className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wide text-sm"
                style={{ fontFamily: "var(--font-ui)", color: paid ? "var(--color-success)" : "var(--color-ink)" }}
              >
                {paid && <CheckCircle2 size={15} />}
                {paid ? "LUNAS" : o.status.toUpperCase()}
              </div>
            </MetaBox>
          </div>

          {/* Items table */}
          <table className="w-full mt-7 text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                {["Item", "Qty", "Harga", "Subtotal"].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={
                      "py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)] border-b border-[var(--color-border-strong)] " +
                      (i === 0 ? "text-left" : "text-right")
                    }
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {o.items.map((it) => (
                <tr key={it.id}>
                  <td className="py-3 text-[var(--color-ink)] border-b border-[var(--color-border)]">{it.productName}</td>
                  <td className="py-3 text-right text-[var(--color-ink-2)] border-b border-[var(--color-border)] tabular-nums">{it.qty}</td>
                  <td className="py-3 text-right text-[var(--color-ink-2)] border-b border-[var(--color-border)] tabular-nums" style={{ fontFamily: "var(--font-ui)" }}>
                    {rupiah(it.unitPriceCents)}
                  </td>
                  <td className="py-3 text-right font-semibold text-[var(--color-ink)] border-b border-[var(--color-border)] tabular-nums" style={{ fontFamily: "var(--font-ui)" }}>
                    {rupiah(it.subtotalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-5 ml-auto max-w-xs space-y-1.5 text-sm">
            <Row label="Subtotal" value={rupiah(o.subtotalCents)} />
            {o.discountCents > 0 && <Row label="Diskon" value={`- ${rupiah(o.discountCents)}`} muted />}
            {o.serviceFeeCents > 0 && <Row label="Biaya layanan" value={rupiah(o.serviceFeeCents)} muted />}
            <div className="divider my-2" />
            <Row label="Total" value={rupiah(o.totalCents)} bold />
          </div>

          {/* Catatan: detail akun TIDAK disertakan di invoice demi keamanan.
              Akun bisa dilihat di halaman pesanan yang terproteksi login. */}
          {o.deliveredItems.length > 0 && (
            <div className="mt-8">
              <div className="card-tint p-4 text-sm text-[var(--color-ink-2)] leading-relaxed">
                <div className="font-bold text-[var(--color-ink)] mb-1">Data akun tidak ditampilkan di invoice</div>
                Demi keamanan, detail akun ({o.deliveredItems.length} item) tidak dicantumkan pada
                dokumen ini. Buka detail pesanan di menu Akun untuk melihat dan menyalin kredensial
                akunmu dengan aman.
              </div>
            </div>
          )}

          <div className="mt-8 pt-5 border-t border-[var(--color-border)] text-xs text-[var(--color-ink-3)] text-center">
            Dokumen ini berfungsi sebagai bukti transaksi resmi. Simpan baik-baik untuk referensi
            pribadi.
          </div>
        </div>
      </div>

      <style>{`
        /* Invoice adalah dokumen: warnanya harus tetap (light) terlepas dari
           tema aplikasi. Tanpa ini, saat dark mode aktif token --color-*
           bernilai gelap sehingga isi invoice (teks/permukaan) ikut gelap,
           baik di preview maupun hasil cetak/Save as PDF. Kita kunci ulang
           token ke nilai light HANYA di dalam .invoice. Di light mode nilainya
           identik (no-op); di dark mode ini memaksa tampilan tetap terang. */
        .invoice {
          --color-surface: #ffffff;
          --color-surface-soft: #f6f6fb;
          --color-surface-tint: #f1eefe;
          --color-surface-mute: #eceaf3;
          --color-border: #e8e6f1;
          --color-border-strong: #d6d3e4;
          --color-brand-700: #3f32a3;
          --color-ink: #15131f;
          --color-ink-2: #56536c;
          --color-ink-3: #6f6c84;
          --color-ink-invert: #ffffff;
          --color-success: #0e9f6e;
          --color-aurora-1: #5b4bda;
          --color-aurora-2: #8b3fd6;
          --color-aurora-3: #c2389a;
          background-color: var(--color-surface);
          color: var(--color-ink);
        }
        @media print {
          body { background: #fff !important; }
          /* Paksa browser mencetak warna & gradient (logo, accent bar, chip)
             yang secara default sering dihilangkan saat cetak/Save as PDF. */
          .invoice, .invoice * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .invoice { color: #000; background: #fff; box-shadow: none !important; border: 1px solid #e5e7eb !important; }
          header, footer, .no-print, .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function MetaBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card-flat p-3">
      <div className="eyebrow text-[10px]">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        muted ? "text-[var(--color-ink-2)]" : "text-[var(--color-ink)]"
      }`}
    >
      <span>{label}</span>
      <span
        className={
          bold
            ? "font-bold text-base text-[var(--color-ink)] tabular-nums"
            : "font-semibold tabular-nums"
        }
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {value}
      </span>
    </div>
  );
}
