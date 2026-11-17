import { describe, expect, it } from 'vitest';
import { buildActivity } from '~~/utils/activity';
import { projectPantry, readDeviceRows } from '~~/utils/pantry-projection';
import type { FooderinoDb } from '~~/utils/db';
import { FakeServer, HOUSEHOLD } from '../support/fake-server';
import { makeDevice } from '../support/device';

const ALICE = 'aaaaaaaa-0000-4000-8000-000000000001';
async function activity(db: FooderinoDb) {
  const rows = await readDeviceRows(db, { events: true });
  const projected = projectPantry(rows);
  return buildActivity({
    items: projected.snapshot.items,
    events: projected.events,
    log: rows.log,
    commands: rows.commands
  });
}

describe('household activity', () => {
  it('shows offline actions once, then replaces pending entries with their confirmed receipts', async () => {
    const server = new FakeServer();
    const d = await makeDevice(server.transport(ALICE), HOUSEHOLD);
    const id = (await d.ops.createItem({ name: 'Milk', amount: 3 }))!;
    await d.ops.useUp(id);
    let entries = await activity(d.db);
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.description === 'Used 1')).toMatchObject({
      names: 'Milk',
      detail: '3 → 2 at home',
      pending: true
    });
    await d.engine.sync('full');
    entries = await activity(d.db);
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.description === 'Used 1')).toMatchObject({ pending: false, actor: ALICE });
  });

  it('includes shopping and unpacking commands even when they emit no stock event', async () => {
    const d = await makeDevice(new FakeServer().transport(ALICE), HOUSEHOLD);
    const id = (await d.ops.createItem({ name: 'Rice' }))!;
    await d.ops.addToShopping(id, 2);
    await d.ops.tick(id);
    // The bag is still projected locally until sync confirms it.
    const rows = await readDeviceRows(d.db, { events: true });
    const entry = [...projectPantry(rows).snapshot.bag.values()][0]!;
    await d.ops.unpack([{ bag_id: entry.id }]);
    const entries = await activity(d.db);
    expect(entries.map((e) => e.description)).toEqual(
      expect.arrayContaining(['Updated shopping list', 'Bought 2', 'Unpacked'])
    );
    expect(entries).toHaveLength(4);
  });

  it('keeps history for deleted items and includes stock changes before and after undo', async () => {
    const d = await makeDevice(new FakeServer().transport(ALICE), HOUSEHOLD);
    const id = (await d.ops.createItem({ name: 'Eggs', amount: 3 }))!;
    await d.engine.sync('full');
    const used = await d.ops.useUp(id);
    await d.engine.sync('full');
    await d.ops.undo(used!);
    await d.engine.sync('full');
    await d.ops.deleteItem(id);
    const entries = await activity(d.db);
    expect(entries.find((e) => e.description === 'Undid change')).toMatchObject({
      names: 'Eggs',
      detail: '2 → 3 at home'
    });
    expect(entries.find((e) => e.description === 'Used 1')?.names).toBe('Eggs');
  });
});
