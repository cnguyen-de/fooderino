import { describe, expect, it } from 'vitest';
import type { ItemId, LocalDate } from '~~/types/pantry';
import { FakeServer, HOUSEHOLD } from '../support/fake-server';
import { makeDevice, project } from '../support/device';

const ALICE = 'aaaaaaaa-0000-4000-8000-000000000001';

async function device() {
  const server = new FakeServer();
  return { server, ...(await makeDevice(server.transport(ALICE), HOUSEHOLD)) };
}

const stockOf = async (d: Awaited<ReturnType<typeof device>>, id: ItemId) => {
  const item = await d.item(id);
  return item && { amount: item.amount, to_buy: item.to_buy, best_before: item.best_before };
};

describe('pantry ops replay over confirmed state', () => {
  it('creates an item with its opening stock, findable before any sync', async () => {
    const d = await device();
    const id = await d.ops.createItem({ name: '  Oat   milk ', aliases: ['oat milk', 'Haferdrink'], to_buy: 2 });

    expect(id).not.toBeNull();
    expect(await d.item(id!)).toMatchObject({ name: 'Oat milk', aliases: ['Haferdrink'], amount: 0, to_buy: 2 });
  });

  it('defaults to count and persists a zero default amount through creation and editing', async () => {
    const d = await device();
    const id = (await d.ops.createItem({ name: 'Milk', default_amount: 0 }))!;
    await d.engine.sync('full');
    expect(d.server.items.get(id)).toMatchObject({ unit: 'count', default_amount: 0 });
    await d.ops.editItem(id, { default_amount: 2 });
    await d.engine.sync('full');
    await d.ops.editItem(id, { default_amount: 0 });
    await d.engine.sync('full');
    expect(d.server.items.get(id)).toMatchObject({ unit: 'count', default_amount: 0 });
  });

  it('uses up and undoes before the command ever left the device', async () => {
    const d = await device();
    const id = (await d.ops.createItem({ name: 'Eggs', amount: 6 }))!;

    const handle = await d.ops.useUp(id, 2);
    expect((await d.item(id))?.amount).toBe(4);
    expect((await project(d.db)).events.map((e) => e.kind)).toEqual(['consume']);

    expect(await d.ops.undo(handle!)).toBeNull();
    expect((await d.item(id))?.amount).toBe(6);
  });

  it('undoes after the command was confirmed and left the outbox', async () => {
    const d = await device();
    const id = (await d.ops.createItem({ name: 'Eggs', amount: 6 }))!;
    const handle = await d.ops.bin(id);
    await d.engine.sync('full');
    expect(await d.db.commands.count()).toBe(0);

    await d.ops.undo(handle!);
    expect((await d.item(id))?.amount).toBe(6);

    await d.engine.sync('full');
    expect(d.server.items.get(id)?.amount).toBe(6);
    expect(d.notices).toEqual([]);
  });

  it('ticks into the bag, unpacks into stock with a date and place, and undoes the unpack', async () => {
    const d = await device();
    const id = (await d.ops.createItem({ name: 'Milk', amount: 0, to_buy: 2 }))!;

    await d.ops.tick(id);
    const [line] = (await project(d.db)).snapshot.bag.values();
    expect(line).toMatchObject({ item_id: id, qty: 2, from_list: 2, state: 'open' });
    expect(await stockOf(d, id)).toEqual({ amount: 0, to_buy: 0, best_before: null });

    const handle = await d.ops.unpack([{ bag_id: line!.id, best_before: '2026-11-20' as LocalDate, place: 'Fridge' }]);
    expect(await stockOf(d, id)).toEqual({ amount: 2, to_buy: 0, best_before: '2026-11-20' });
    expect((await d.item(id))?.tags).toEqual([{ kind: 'place', name: 'Fridge' }]);

    await d.ops.undo(handle!);
    expect(await stockOf(d, id)).toEqual({ amount: 0, to_buy: 0, best_before: null });
    expect((await project(d.db)).snapshot.bag.get(line!.id)?.state).toBe('open');
  });

  it('routes one edit to a metadata sheet, a set and a want, and undoes all three', async () => {
    const d = await device();
    const id = (await d.ops.createItem({ name: 'Rice', amount: 1 }))!;
    await d.engine.sync('full');

    const handle = await d.ops.editItem(id, {
      name: 'Basmati',
      tags: [{ kind: 'store', name: 'Asia market' }],
      amount: 3,
      best_before: '2027-01-01' as LocalDate,
      to_buy: 1
    });
    expect((await d.db.commands.orderBy('created_seq').toArray()).map((c) => c.kind)).toEqual(['set', 'want']);
    expect(await d.db.edits.count()).toBe(1);
    expect(await d.item(id)).toMatchObject({ name: 'Basmati', amount: 3, to_buy: 1, best_before: '2027-01-01' });

    await d.ops.undo(handle!);
    expect(await d.item(id)).toMatchObject({ name: 'Rice', tags: [], amount: 1, to_buy: 0, best_before: null });

    await d.engine.sync('full');
    expect(d.server.items.get(id)).toMatchObject({ name: 'Rice', amount: 1, to_buy: 0, best_before: null });
    expect(await d.db.commands.count()).toBe(0);
    expect(await d.db.edits.count()).toBe(0);
  });

  it('deletes an item and brings it back on undo', async () => {
    const d = await device();
    const id = (await d.ops.createItem({ name: 'Salt', amount: 1 }))!;
    const handle = await d.ops.deleteItem(id);
    expect(await d.item(id)).toMatchObject({ deleted_at: expect.any(String) });

    await d.ops.undo(handle!);
    expect(await d.item(id)).toMatchObject({ deleted_at: null });
  });

  it('refuses a use the device already knows is impossible, without queueing it', async () => {
    const d = await device();
    const id = (await d.ops.createItem({ name: 'Milk', amount: 0 }))!;

    expect(await d.ops.useUp(id)).toBeNull();
    expect(d.notices).toEqual([
      expect.objectContaining({ kind: 'use', reason: 'insufficient_stock', item_name: 'Milk' })
    ]);
    expect(await d.db.commands.count()).toBe(1);
  });

  it('increments offline from the latest projected quantity and undoes one tap', async () => {
    const d = await device();
    const id = (await d.ops.createItem({ name: 'Bread', default_amount: 3 }))!;
    await d.ops.addToShopping(id);
    const second = await d.ops.addToShopping(id);
    expect((await d.item(id))?.to_buy).toBe(6);
    await d.ops.undo(second!);
    expect((await d.item(id))?.to_buy).toBe(3);
    await d.engine.sync('full');
    expect(d.server.items.get(id)?.to_buy).toBe(3);
  });

  it('adds one when the default amount is zero', async () => {
    const d = await device();
    const id = (await d.ops.createItem({ name: 'Milk', default_amount: 0 }))!;
    await d.ops.addToShopping(id);
    await d.ops.addToShopping(id);
    expect((await d.item(id))?.to_buy).toBe(2);
  });

  it('adds another default quantity on every tap, while an explicit quantity sets the target', async () => {
    const d = await device();
    const id = (await d.ops.createItem({ name: 'Bread', default_amount: 1 }))!;

    await d.ops.addToShopping(id);
    expect(await d.ops.addToShopping(id)).not.toBeNull();
    expect((await d.item(id))?.to_buy).toBe(2);
    await d.ops.addToShopping(id, 3);

    expect((await d.item(id))?.to_buy).toBe(3);
    expect((await d.db.commands.orderBy('created_seq').toArray()).map((c) => c.kind)).toEqual([
      'create',
      'want',
      'want',
      'want'
    ]);
  });

  it('ends with the server holding exactly what the device showed offline', async () => {
    const d = await device();
    const milk = (await d.ops.createItem({ name: 'Milk', amount: 2, to_buy: 1 }))!;
    const eggs = (await d.ops.createItem({ name: 'Eggs', amount: 10 }))!;
    await d.ops.useUp(milk);
    await d.ops.tick(milk);
    const [entry] = (await project(d.db)).snapshot.bag.values();
    await d.ops.unpack([{ bag_id: entry!.id }]);
    await d.ops.bin(eggs, 3);
    await d.ops.dismiss(eggs);
    await d.ops.merge(eggs, milk).then(() => d.ops.cancelBag(entry!.id));
    const offline = { milk: await stockOf(d, milk), eggs: await stockOf(d, eggs) };

    await d.engine.sync('full');

    expect(await d.db.commands.count()).toBe(0);
    expect({ milk: await stockOf(d, milk), eggs: await stockOf(d, eggs) }).toEqual(offline);
    const { amount, to_buy, best_before } = d.server.items.get(milk)!;
    expect({ amount, to_buy, best_before }).toEqual(offline.milk);
  });
});
