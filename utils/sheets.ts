import type { HouseholdId, Instant } from '~~/types/pantry';
import type { PendingSheet, SheetStore } from '~~/types/sync';
import type { FooderinoDb } from '~~/utils/db';

/** A pending sheet shows until the server holds the row at least as new: by then it either landed or lost. */
export function sheetPending(sheet: { updated_at: string }, confirmed: { updated_at: string } | undefined): boolean {
  return !confirmed || Date.parse(confirmed.updated_at) < Date.parse(sheet.updated_at);
}

/** A stamp for a new sheet that outranks every stamp the device knows for the row, even when this clock runs behind. */
export function stampAbove(at: Instant, ...known: (string | null | undefined)[]): Instant {
  const floor = Math.max(0, ...known.map((k) => (k ? Date.parse(k) + 1 : 0)));
  return new Date(Math.max(Date.parse(at), floor)).toISOString() as Instant;
}

/** One store's queued sheets. Inside a transaction that covers `edits`, it joins that transaction. */
export function pendingSheets<S extends SheetStore>(db: FooderinoDb, store: S): Promise<PendingSheet<S>[]> {
  return db.edits.where('store').equals(store).toArray() as unknown as Promise<PendingSheet<S>[]>;
}

interface SheetRow {
  id: string;
  household_id: HouseholdId;
  updated_at: Instant;
  seq: number;
}

/**
 * Confirmed rows with pending sheets on top, keyed by id. A sheet for a row the
 * server has not seen yet shows as a new row; one aimed at another household never shows.
 */
export function overlaySheets<R extends SheetRow>(
  confirmed: readonly R[],
  pending: readonly (Omit<R, 'seq'> & { store?: SheetStore })[]
): Map<R['id'], Omit<R, 'seq'>> {
  const rows = new Map<R['id'], R>(confirmed.map((r) => [r.id, r]));
  const out = new Map<R['id'], Omit<R, 'seq'>>(confirmed.map(({ seq: _, ...row }) => [row.id, row]));
  for (const { store: _, ...sheet } of pending) {
    const row = rows.get(sheet.id);
    if (row && row.household_id !== sheet.household_id) continue;
    if (sheetPending(sheet, row)) out.set(sheet.id, sheet as unknown as Omit<R, 'seq'>);
  }
  return out;
}
