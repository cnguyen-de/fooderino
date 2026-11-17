import { describe, expect, it } from 'vitest';
import { liveQuery } from 'dexie';
import type { ItemId } from '~~/types/pantry';
import { projectPantry, readDeviceRows, type DeviceRows } from '~~/utils/pantry-projection';
import { FakeServer, HOUSEHOLD } from '../support/fake-server';
import { makeDevice } from '../support/device';

describe("usePantry's live read", () => {
  it('re-emits one whole snapshot after an op and after the sync that confirms it', async () => {
    const server = new FakeServer();
    const d = await makeDevice(server.transport('a'), HOUSEHOLD);
    const seen: DeviceRows[] = [];
    let waiter: (() => void) | null = null;
    const next = () => new Promise<void>((resolve) => (waiter = resolve));
    const sub = liveQuery(() => readDeviceRows(d.db, { events: true })).subscribe((rows) => {
      seen.push(rows);
      waiter?.();
    });
    const amount = (rows: DeviceRows, id: ItemId) => projectPantry(rows).snapshot.items.get(id)?.amount;

    await next();
    const created = next();
    const id = (await d.ops.createItem({ name: 'Milk', amount: 3 }))!;
    await created;
    expect(amount(seen.at(-1)!, id)).toBe(3);

    const used = next();
    await d.ops.useUp(id);
    await used;
    expect(amount(seen.at(-1)!, id)).toBe(2);

    await d.engine.sync('push');
    await new Promise((r) => setTimeout(r, 50));
    const last = seen.at(-1)!;
    expect(last.commands).toHaveLength(0);
    expect(amount(last, id)).toBe(2);
    expect(seen.every((rows) => [undefined, 3, 2].includes(amount(rows, id)))).toBe(true);
    sub.unsubscribe();
  });
});
