import type { HouseholdId, Item, ItemId } from '~~/types/pantry';
import type { RejectionNotice } from '~~/types/sync';
import { openFooderinoDb, type FooderinoDb } from '~~/utils/db';
import { createPantryOps } from '~~/utils/pantry-ops';
import { projectPantry, readDeviceRows, type Projection } from '~~/utils/pantry-projection';
import { createSyncEngine, type SyncTransport } from '~~/utils/sync-engine';
import { setSyncState } from '~~/utils/sync-state';

/** Reads the device the way usePantry's liveQuery does. */
export async function project(db: FooderinoDb): Promise<Projection> {
  return projectPantry(await readDeviceRows(db, { events: true }));
}

export interface Device {
  db: FooderinoDb;
  engine: ReturnType<typeof createSyncEngine>;
  ops: ReturnType<typeof createPantryOps>;
  notices: RejectionNotice[];
  item(id: ItemId): Promise<Item | undefined>;
}

/** One phone: its own IndexedDB, engine and ops, as two household members would have. */
export async function makeDevice(transport: SyncTransport, household: HouseholdId | null, now?: () => Date): Promise<Device> {
  const db = openFooderinoDb(`device-${crypto.randomUUID()}`);
  await db.open();
  await setSyncState(db, { household_id: household });
  const notices: RejectionNotice[] = [];
  const onRejection = (n: RejectionNotice[]) => notices.push(...n);
  const engine = createSyncEngine({ db, transport, onRejection });
  const ops = createPantryOps({ db, onRejection, ...(now ? { now } : {}) });
  return {
    db,
    engine,
    ops,
    notices,
    item: async (id) => (await project(db)).snapshot.items.get(id)
  };
}
