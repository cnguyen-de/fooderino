import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import type { CommandId, ItemId, LocalDate } from '~~/types/pantry';
import type { Season } from '~~/types/season';
import { createSyncEngine } from '~~/utils/sync-engine';
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

  it('undoes commands by id, pending or confirmed, and skips ones already undone or unknown', async () => {
    const d = await device();
    const pork = (await d.ops.createItem({ name: 'Pork', amount: 500 }))!;
    const rice = (await d.ops.createItem({ name: 'Rice', amount: 3 }))!;
    const pending = (await d.ops.useItems([{ id: pork, qty: 200 }]))!.commands.map((c) => c.id);
    const confirmed = (await d.ops.useItems([{ id: rice, qty: 1 }]))!.commands.map((c) => c.id);
    await d.engine.sync('full');
    const late = (await d.ops.useItems([{ id: pork, qty: 100 }]))!.commands.map((c) => c.id);

    await d.ops.undoCommands([...pending, ...confirmed, ...late, crypto.randomUUID() as CommandId]);
    expect((await d.item(pork))?.amount).toBe(500);
    expect((await d.item(rice))?.amount).toBe(3);

    await d.ops.undoCommands([...pending, ...confirmed]);
    await d.engine.sync('full');
    expect(d.server.items.get(pork)?.amount).toBe(500);
    expect(d.server.items.get(rice)?.amount).toBe(3);
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

describe('item seasons', () => {
  const kale = { from: 11, to: 2 } as const;

  it("shows a new item's season offline and lands it on the server once the create has", async () => {
    const d = await device();
    const id = (await d.ops.createItem({ name: 'Grünkohl', season: kale, to_buy: 1 }))!;
    expect(await d.item(id)).toMatchObject({ name: 'Grünkohl', season: kale, to_buy: 1 });

    await d.engine.sync('full');

    expect(d.server.items.get(id)).toMatchObject({ name: 'Grünkohl', season: kale, to_buy: 1 });
    expect(await d.db.edits.count()).toBe(0);
    expect(await d.item(id)).toMatchObject({ season: kale });
  });

  it('holds the season sheet while its create is still queued, then sends it', async () => {
    const d = await device();
    const transport = d.server.transport(ALICE);
    const id = (await d.ops.createItem({ name: 'Wildgulasch', season: { from: 10, to: 12 } }))!;
    const engine = createSyncEngine({ db: d.db, transport });

    d.server.failNextApply('before');
    await expect(engine.sync('full')).rejects.toThrow('network down');
    expect(transport.calls.filter((c) => c.startsWith('push:items'))).toEqual([]);
    expect(d.server.items.has(id)).toBe(false);
    expect(await d.item(id)).toMatchObject({ season: { from: 10, to: 12 } });

    await engine.sync('full');
    expect(d.server.items.get(id)?.season).toEqual({ from: 10, to: 12 });
  });

  it('keeps the season when the create lands but the sheet push fails', async () => {
    const d = await device();
    const id = (await d.ops.createItem({ name: 'Spargel', season: { from: 4, to: 6 } }))!;

    d.server.failNextPush();
    await expect(d.engine.sync('full')).rejects.toThrow('network down');
    expect(d.server.items.get(id)?.season).toBeNull();
    expect(await d.item(id)).toMatchObject({ season: { from: 4, to: 6 } });

    await d.engine.sync('full');
    expect(d.server.items.get(id)?.season).toEqual({ from: 4, to: 6 });
  });

  it('queues nothing for a refused create, season included', async () => {
    const d = await device();
    expect(await d.ops.createItem({ name: '   ', season: kale })).toBeNull();
    expect(await d.db.commands.count()).toBe(0);
    expect(await d.db.edits.count()).toBe(0);
  });

  it('sets, clears and undoes a season through the metadata sheet, and refuses a month out of range', async () => {
    const d = await device();
    const id = (await d.ops.createItem({ name: 'Kürbis' }))!;
    await d.engine.sync('full');

    const handle = await d.ops.editItem(id, { season: { from: 9, to: 11 } });
    await d.engine.sync('full');
    expect(d.server.items.get(id)?.season).toEqual({ from: 9, to: 11 });

    await d.ops.undo(handle!);
    await d.engine.sync('full');
    expect(d.server.items.get(id)?.season).toBeNull();

    await expect(d.ops.editItem(id, { season: { from: 0, to: 13 } as never })).rejects.toThrow(RangeError);
  });

  it('stores a season the editor hands over as reactive state, on create and on edit', async () => {
    const d = await device();
    const id = (await d.ops.createItem({ name: 'Spargel', season: reactive<Season>({ from: 4, to: 6 }) }))!;
    expect(await d.item(id)).toMatchObject({ season: { from: 4, to: 6 } });

    await d.ops.editItem(id, { season: reactive<Season>({ from: 4, to: 5 }) });
    await d.engine.sync('full');
    expect(d.server.items.get(id)?.season).toEqual({ from: 4, to: 5 });
  });
});
