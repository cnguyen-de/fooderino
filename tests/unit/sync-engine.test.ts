import { describe, expect, it } from 'vitest';
import type { CommandId, HouseholdId, Instant, ItemId, ItemRow } from '~~/types/pantry';
import type { QueuedCommand } from '~~/types/sync';
import { PendingCommandsError, type SyncTransport } from '~~/utils/sync-engine';
import { getSyncState } from '~~/utils/sync-state';
import { FakeServer, HOUSEHOLD, OTHER_HOUSEHOLD } from '../support/fake-server';
import { makeDevice, project } from '../support/device';

const ALICE = 'aaaaaaaa-0000-4000-8000-000000000001';
const BOB = 'bbbbbbbb-0000-4000-8000-000000000002';

async function seededItem(server: FakeServer, name = 'Milk', amount = 1): Promise<ItemId> {
  const id = crypto.randomUUID() as ItemId;
  const response = server.apply(BOB, [
    {
      id: crypto.randomUUID() as CommandId,
      household_id: HOUSEHOLD,
      item_id: id,
      at: '2026-11-01T00:00:00.000Z' as Instant,
      kind: 'create',
      item: { name, aliases: [], tags: [], unit: 'count', default_amount: 1, shelf_life_days: null },
      start: { amount }
    }
  ]);
  expect(response.results[0]!.status).toBe('accepted');
  return id;
}

describe('drain', () => {
  it('sends the outbox in order, in batches of 50, and confirms what each batch touched', async () => {
    const server = new FakeServer();
    const transport = server.transport(ALICE);
    const device = await makeDevice(transport, HOUSEHOLD);
    const id = (await device.ops.createItem({ name: 'Rice', amount: 200 }))!;
    for (let i = 0; i < 119; i++) await device.ops.useUp(id);
    const queued = (await device.db.commands.orderBy('created_seq').toArray()).map((c) => c.id);

    await device.engine.sync('push');

    expect(server.batches.map((b) => b.length)).toEqual([50, 50, 20]);
    expect(server.batches.flat().map((c) => c.id)).toEqual(queued);
    expect(await device.db.commands.count()).toBe(0);
    expect((await device.db.items.get(id))?.amount).toBe(81);
    expect(await device.db.events.count()).toBe(119);
    expect(await device.db.log.count()).toBe(120);
  });

  it('drops a rejected command, reports it, and keeps draining the rest', async () => {
    const server = new FakeServer();
    const device = await makeDevice(server.transport(ALICE), HOUSEHOLD);
    const milk = await seededItem(server, 'Milk', 1);
    await device.engine.sync('full');

    // Bob uses the last one while Alice is offline and still sees it.
    server.apply(BOB, [
      { id: crypto.randomUUID() as CommandId, household_id: HOUSEHOLD, item_id: milk, at: '2026-11-02T00:00:00.000Z' as Instant, kind: 'use', qty: 1, waste: false }
    ]);
    const used = await device.ops.useUp(milk);
    await device.ops.addToShopping(milk, 3);
    expect(used).not.toBeNull();

    await device.engine.sync('full');

    expect(device.notices).toEqual([
      expect.objectContaining({ kind: 'use', item_id: milk, item_name: 'Milk', reason: 'insufficient_stock' })
    ]);
    expect(await device.db.commands.count()).toBe(0);
    expect(await device.item(milk)).toMatchObject({ amount: 0, to_buy: 3 });
  });

  it('keeps the batch queued on a transport error and sends it on the next sync', async () => {
    const server = new FakeServer();
    const device = await makeDevice(server.transport(ALICE), HOUSEHOLD);
    const milk = await seededItem(server, 'Milk', 2);
    await device.engine.sync('full');
    await device.ops.useUp(milk);

    server.failNextApply('before');
    await expect(device.engine.sync('full')).rejects.toThrow('network down');
    expect(await device.db.commands.count()).toBe(1);
    expect((await device.item(milk))?.amount).toBe(1);

    await device.engine.sync('full');
    expect(await device.db.commands.count()).toBe(0);
    expect(server.items.get(milk)?.amount).toBe(1);
  });

  it('never double counts an accepted command whose response was lost', async () => {
    const server = new FakeServer();
    const device = await makeDevice(server.transport(ALICE), HOUSEHOLD);
    const milk = await seededItem(server, 'Milk', 3);
    await device.engine.sync('full');
    await device.ops.useUp(milk);

    server.failNextApply('after-commit');
    await expect(device.engine.sync('full')).rejects.toThrow('connection reset');

    // The pull brought the server's amount, which already includes the pending use.
    expect(await device.db.commands.count()).toBe(1);
    expect((await device.db.items.get(milk))?.amount).toBe(2);
    expect((await device.item(milk))?.amount).toBe(2);

    await device.engine.sync('full');
    expect(await device.db.commands.count()).toBe(0);
    expect((await device.item(milk))?.amount).toBe(2);
    expect(server.items.get(milk)?.amount).toBe(2);
  });
});

describe('pull', () => {
  it('pulls by server seq, so a late write with an old gesture time still arrives', async () => {
    const server = new FakeServer();
    const device = await makeDevice(server.transport(ALICE), HOUSEHOLD);
    const milk = await seededItem(server, 'Milk', 2);
    await device.engine.sync('full');

    server.apply(BOB, [
      { id: crypto.randomUUID() as CommandId, household_id: HOUSEHOLD, item_id: milk, at: '2020-01-01T00:00:00.000Z' as Instant, kind: 'use', qty: 1, waste: false }
    ]);
    await device.engine.sync('full');

    expect((await device.db.items.get(milk))?.amount).toBe(1);
    expect((await device.db.events.toArray()).map((e) => e.occurred_at)).toContain('2020-01-01T00:00:00.000Z');
    const { cursors } = await getSyncState(device.db);
    expect(cursors.events).toBe(Math.max(...server.rows('events').map((e) => e.seq)));
  });

  it('pages past the row limit by seq', async () => {
    const server = new FakeServer();
    const device = await makeDevice(server.transport(ALICE), HOUSEHOLD);
    const milk = await seededItem(server, 'Milk', 1);
    for (let i = 0; i < 1005; i++) {
      server.apply(BOB, [
        { id: crypto.randomUUID() as CommandId, household_id: HOUSEHOLD, item_id: milk, at: '2026-11-03T00:00:00.000Z' as Instant, kind: 'dismiss' }
      ]);
    }

    await device.engine.sync('full');

    expect(await device.db.events.count()).toBe(1005);
    expect(await device.db.log.count()).toBe(1006);
  });

  it('never lets an older copy of a row replace a newer one', async () => {
    const server = new FakeServer();
    const real = server.transport(ALICE);
    const milk = await seededItem(server, 'Milk', 5);
    const stale = structuredClone(server.items.get(milk)!);
    const transport: SyncTransport = {
      ...real,
      pull: async (def, h, after, limit) =>
        def.store === 'items' ? ([stale] as never) : real.pull(def, h, after, limit)
    };
    const device = await makeDevice(transport, HOUSEHOLD);
    await device.ops.useUp(milk).catch(() => null);
    await device.db.items.put({ ...stale, amount: 4, seq: stale.seq + 10 } as ItemRow);

    await device.engine.sync('full');

    expect((await device.db.items.get(milk))?.amount).toBe(4);
  });
});

describe('membership', () => {
  it('wipes household data and cursors when the server moved the user, and keeps recipes', async () => {
    const server = new FakeServer();
    const device = await makeDevice(server.transport(ALICE), HOUSEHOLD);
    await seededItem(server);
    await device.engine.sync('full');
    await device.db.recipes.put({
      id: crypto.randomUUID(), user_id: ALICE, name: 'Soup', description: null, ingredients: [], instructions: null,
      saved: true, updated_at: '2026-11-01T00:00:00.000Z', deleted_at: null
    });
    expect(await device.db.items.count()).toBe(1);

    server.membership.set(ALICE, OTHER_HOUSEHOLD);
    expect(await device.engine.syncMembership()).toBe('changed');

    const state = await getSyncState(device.db);
    expect(state).toMatchObject({ household_id: OTHER_HOUSEHOLD, cursors: {}, hydrated_at: null });
    for (const store of ['households', 'members', 'items', 'bag', 'events', 'log', 'edits'] as const) {
      expect(await device.db.table(store).count(), store).toBe(0);
    }
    expect(await device.db.recipes.count()).toBe(1);
    expect(await device.engine.syncMembership()).toBe('same');
  });

  it('drains first, so commands for the old household are rejected and surfaced, not lost silently', async () => {
    const server = new FakeServer();
    const device = await makeDevice(server.transport(ALICE), HOUSEHOLD);
    const milk = await seededItem(server, 'Milk', 2);
    await device.engine.sync('full');
    await device.ops.useUp(milk);

    server.membership.set(ALICE, OTHER_HOUSEHOLD);
    await device.engine.syncMembership();

    expect(device.notices).toEqual([expect.objectContaining({ kind: 'use', reason: 'not_member', item_name: 'Milk' })]);
    expect(await device.db.commands.count()).toBe(0);
    expect((await getSyncState(device.db)).household_id).toBe(OTHER_HOUSEHOLD);
  });

  it('refuses to reset while commands cannot drain, and keeps the data', async () => {
    const server = new FakeServer();
    const device = await makeDevice(server.transport(ALICE), HOUSEHOLD);
    const milk = await seededItem(server, 'Milk', 2);
    await device.engine.sync('full');
    await device.ops.useUp(milk);

    server.membership.set(ALICE, OTHER_HOUSEHOLD);
    server.failNextApply('before');
    await expect(device.engine.syncMembership()).rejects.toBeInstanceOf(PendingCommandsError);

    expect(await device.db.commands.count()).toBe(1);
    expect(await device.db.items.count()).toBe(1);
    expect((await getSyncState(device.db)).household_id).toBe(HOUSEHOLD);
  });

  it('adopts the household on first sight', async () => {
    const server = new FakeServer();
    const device = await makeDevice(server.transport(ALICE), null);
    await seededItem(server);

    expect(await device.engine.syncMembership()).toBe('changed');
    await device.engine.sync('full');

    expect((await getSyncState(device.db)).household_id).toBe(HOUSEHOLD);
    expect(await device.db.items.count()).toBe(1);
    expect((await getSyncState(device.db)).hydrated_at).not.toBeNull();
  });
});

describe('metadata edits', () => {
  it('pushes an edit only after the create it depends on has landed', async () => {
    const server = new FakeServer();
    const transport = server.transport(ALICE);
    const device = await makeDevice(transport, HOUSEHOLD);
    const id = (await device.ops.createItem({ name: 'Milk' }))!;
    await device.ops.editItem(id, { name: 'Oat milk', tags: [{ kind: 'place', name: 'Fridge' }] });

    await device.engine.sync('full');

    expect(transport.calls.filter((c) => c.startsWith('apply') || c.startsWith('push'))).toEqual(['apply:1', 'push:items:1']);
    expect(server.items.get(id)).toMatchObject({ name: 'Oat milk', tags: [{ kind: 'place', name: 'Fridge' }] });
    expect(await device.db.edits.count()).toBe(0);
    expect(await device.item(id)).toMatchObject({ name: 'Oat milk' });
  });

  it('lets the newer of two sheets win on every device', async () => {
    const server = new FakeServer();
    const milk = await seededItem(server);
    const clock = (iso: string) => () => new Date(iso);
    const alice = await makeDevice(server.transport(ALICE), HOUSEHOLD, clock('2026-11-05T10:00:00.000Z'));
    const bob = await makeDevice(server.transport(BOB), HOUSEHOLD, clock('2026-11-05T11:00:00.000Z'));
    await alice.engine.sync('full');
    await bob.engine.sync('full');

    await alice.ops.editItem(milk, { name: 'Alice milk' });
    await bob.ops.editItem(milk, { name: 'Bob milk' });
    await bob.engine.sync('full');
    await alice.engine.sync('full');
    await bob.engine.sync('full');

    expect(server.items.get(milk)?.name).toBe('Bob milk');
    expect((await alice.item(milk))?.name).toBe('Bob milk');
    expect((await bob.item(milk))?.name).toBe('Bob milk');
    expect(await alice.db.edits.count()).toBe(0);
  });

  it('drops the edits of an item whose create was rejected', async () => {
    const server = new FakeServer();
    const device = await makeDevice(server.transport(ALICE), HOUSEHOLD);
    const id = crypto.randomUUID() as ItemId;
    const create: QueuedCommand = {
      id: crypto.randomUUID() as CommandId, household_id: HOUSEHOLD, item_id: id, at: '2026-11-05T00:00:00.000Z' as Instant,
      kind: 'create', item: { name: '  ', aliases: [], tags: [], unit: 'count', default_amount: 1, shelf_life_days: null },
      start: {}, created_seq: 1
    };
    await device.db.commands.add(create);
    await device.db.edits.put({
      store: 'items', id, household_id: HOUSEHOLD, name: 'Ghost', aliases: [], tags: [], unit: 'count', default_amount: 1,
      shelf_life_days: null, deleted_at: null, updated_at: '2026-11-05T00:00:01.000Z' as Instant
    });

    await device.engine.sync('full');

    expect(await device.db.edits.count()).toBe(0);
    expect(device.notices).toEqual([expect.objectContaining({ kind: 'create', reason: 'invalid' })]);
  });
});

describe('sync scheduling', () => {
  it('runs one sync at a time and folds a burst of requests into one more run', async () => {
    const server = new FakeServer();
    const transport = server.transport(ALICE);
    const device = await makeDevice(transport, HOUSEHOLD as HouseholdId);
    await seededItem(server);

    await Promise.all([device.engine.sync('push'), device.engine.sync('full'), device.engine.sync('full'), device.engine.sync('push')]);

    expect(transport.calls.filter((c) => c === 'pull:items')).toHaveLength(1);
    expect((await project(device.db)).snapshot.items.size).toBe(1);
  });
});
