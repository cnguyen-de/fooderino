import { describe, expect, it } from 'vitest';
import { applyCommand, replayPending } from '~~/utils/pantry';
import raw from '../fixtures/commands.json';
import type { BagEntry, BagId, Command, CommandId, Item, ItemEvent, ItemId, Snapshot } from '~~/utils/pantry';

type Json = Record<string, unknown>;

interface FixtureCase {
  name: string;
  initial: { items: Json[]; bag: Json[] };
  receipts?: string[];
  commands: Json[];
  expect: {
    items?: Record<string, Json>;
    bag?: Record<string, Json>;
    events?: Json[];
    rejections?: { command: string; reason: string }[];
  };
}

interface FixtureFile {
  defaults: { item: Json; bag_entry: Json; command: Json };
  cases: FixtureCase[];
}

const fixture = raw as unknown as FixtureFile;

function snapshotOf(initial: FixtureCase['initial']): Snapshot {
  const items = initial.items.map((row) => ({ ...fixture.defaults.item, ...row }) as unknown as Item);
  const bag = initial.bag.map((row) => ({ ...fixture.defaults.bag_entry, ...row }) as unknown as BagEntry);
  return {
    items: new Map(items.map((i): [ItemId, Item] => [i.id, i])),
    bag: new Map(bag.map((b): [BagId, BagEntry] => [b.id, b])),
    log: new Map()
  };
}

function summarize({ household_id, command_id, occurred_at, actor, origin, ...rest }: ItemEvent) {
  return rest;
}

describe('command fixture', () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const commands = c.commands.map((cmd) => ({ ...fixture.defaults.command, ...cmd }) as unknown as Command);
    const receipts = new Set((c.receipts ?? []) as CommandId[]);

    const { state, events, rejected } = replayPending(snapshotOf(c.initial), commands, receipts);

    for (const [id, fields] of Object.entries(c.expect.items ?? {})) {
      expect(state.items.get(id as ItemId), `item ${id}`).toMatchObject(fields);
    }
    for (const [id, fields] of Object.entries(c.expect.bag ?? {})) {
      expect(state.bag.get(id as BagId), `bag ${id}`).toMatchObject(fields);
    }
    expect(events.map(summarize)).toEqual(c.expect.events ?? []);
    expect(rejected).toEqual(c.expect.rejections ?? []);
  });

  it('covers every command kind and every rejection reason', () => {
    const kinds = new Set(fixture.cases.flatMap((c) => c.commands.map((cmd) => cmd.kind)));
    const reasons = new Set(fixture.cases.flatMap((c) => (c.expect.rejections ?? []).map((r) => r.reason)));
    expect([...kinds].sort()).toEqual(
      ['cancel_bag', 'create', 'dismiss', 'merge', 'set', 'tick', 'undo', 'unpack', 'use', 'want'].sort()
    );
    expect([...reasons].sort()).toEqual(['bag_closed', 'cannot_undo', 'insufficient_stock', 'invalid', 'not_found']);
  });
});

describe('applyCommand', () => {
  const milk = { ...fixture.defaults.item, id: 'milk', name: 'Milk', amount: 2 } as unknown as Item;
  const initial: Snapshot = { items: new Map([[milk.id, milk]]), bag: new Map(), log: new Map() };
  const use = {
    ...fixture.defaults.command,
    id: 'c1',
    kind: 'use',
    item_id: 'milk',
    qty: 1,
    waste: false
  } as unknown as Command;

  it('leaves its input snapshot untouched', () => {
    const result = applyCommand(initial, use);
    expect('state' in result && result.state.items.get(milk.id)?.amount).toBe(1);
    expect(initial.items.get(milk.id)?.amount).toBe(2);
    expect(initial.log.size).toBe(0);
  });

  it('returns the same state and no events for a command id already in the log', () => {
    const first = applyCommand(initial, use);
    if (!('state' in first)) throw new Error('expected the first apply to be accepted');
    const second = applyCommand(first.state, use);
    expect(second).toEqual({ state: first.state, events: [] });
  });
});
