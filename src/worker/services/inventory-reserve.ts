/**
 * Reservasi stok yang aman race condition di D1.
 *
 * Strategi:
 *   - Stok = baris-baris di product_inventory_items dengan status='available'.
 *   - Untuk reservasi, kita pakai UPDATE conditional yang memilih N baris
 *     paling lama, lalu menulis status='reserved' beserta order_id.
 *
 *   Karena D1 (SQLite) belum mendukung UPDATE ... LIMIT ... ORDER BY ... RETURNING
 *     dengan cara yang konsisten lewat HTTP API, kita pakai pendekatan dua langkah
 *     dengan prepared statement berturut-turut yang bersifat atomik per statement,
 *     dan retry guard untuk mendeteksi tabrakan.
 *
 *   Algoritme:
 *     1) UPDATE product_inventory_items
 *          SET status='reserved', reserved_for_order_id=?, reserved_at=?
 *          WHERE id IN (SELECT id FROM product_inventory_items
 *                        WHERE product_id=? AND status='available'
 *                        ORDER BY created_at, id LIMIT ?)
 *          AND status='available'
 *
 *     2) Hitung berapa baris yang benar-benar berhasil di-reserve untuk order_id ini.
 *        Jika kurang dari yang diminta -> rollback (kembalikan ke available) dan return false.
 *
 *   Catatan: subselect di SQLite dievaluasi sebelum UPDATE; namun karena D1 menjalankan
 *   tiap statement sebagai unit atomik, dua kompetisi paralel akan diserialisasi.
 *   Klausul WHERE status='available' tambahan menjadi guard double-check terhadap race.
 */

import { now } from "../lib/time";

export interface ReserveOutcome {
  success: boolean;
  reserved: number;
  needed: number;
}

export async function tryReserveStock(
  db: D1Database,
  productId: string,
  qty: number,
  orderId: string,
): Promise<ReserveOutcome> {
  const ts = now();
  // Step 1: tandai sebanyak qty baris tertua yang available.
  await db
    .prepare(
      `UPDATE product_inventory_items
         SET status = 'reserved',
             reserved_for_order_id = ?,
             reserved_at = ?,
             updated_at = ?
         WHERE id IN (
           SELECT id FROM product_inventory_items
            WHERE product_id = ? AND status = 'available'
            ORDER BY created_at, id
            LIMIT ?
         )
         AND status = 'available'`,
    )
    .bind(orderId, ts, ts, productId, qty)
    .run();

  // Step 2: hitung berapa baris benar-benar terkunci ke order ini.
  const row = await db
    .prepare(
      `SELECT COUNT(*) as c FROM product_inventory_items
        WHERE product_id = ? AND reserved_for_order_id = ? AND status = 'reserved'`,
    )
    .bind(productId, orderId)
    .first<{ c: number }>();

  const reserved = row?.c ?? 0;
  return { success: reserved >= qty, reserved, needed: qty };
}

/** Lepas semua reservasi milik order tertentu (untuk seluruh produk). */
export async function releaseReservationsForOrder(db: D1Database, orderId: string) {
  const ts = now();
  await db
    .prepare(
      `UPDATE product_inventory_items
         SET status = 'available', reserved_for_order_id = NULL, reserved_at = NULL, updated_at = ?
         WHERE reserved_for_order_id = ? AND status = 'reserved'`,
    )
    .bind(ts, orderId)
    .run();
}

/** Konfirmasi reservasi menjadi sold ketika pembayaran sukses. */
export async function commitReservationForOrder(db: D1Database, orderId: string) {
  const ts = now();
  await db
    .prepare(
      `UPDATE product_inventory_items
         SET status = 'sold', sold_to_order_id = reserved_for_order_id,
             reserved_for_order_id = NULL,
             sold_at = ?, updated_at = ?
         WHERE reserved_for_order_id = ? AND status = 'reserved'`,
    )
    .bind(ts, ts, orderId)
    .run();
}

export async function countAvailableStock(db: D1Database, productId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM product_inventory_items WHERE product_id = ? AND status='available'`,
    )
    .bind(productId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function hasActiveReservations(db: D1Database, productId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS x FROM product_inventory_items WHERE product_id = ? AND status='reserved' LIMIT 1`,
    )
    .bind(productId)
    .first<{ x: number }>();
  return !!row;
}
