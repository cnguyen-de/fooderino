import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '~~/utils/db';
import { buildLog, pruneLogs, LOCAL_LOG_LIMIT } from '~~/utils/log-ops';

beforeEach(async () => {
  await db.open();
  await db.logs.clear();
});

describe('buildLog', () => {
  it('stamps a uuid and created_at, and carries no tombstone fields', () => {
    const log = buildLog('list-1', 'a@b.c', 'milk', 'created', '');
    expect(log.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(log.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(log).not.toHaveProperty('deleted_at');
    expect(log).not.toHaveProperty('updated_at');
  });
});

describe('pruneLogs', () => {
  const seed = async (listId: string, count: number) => {
    await db.logs.bulkAdd(
      Array.from({ length: count }, (_, i) => ({
        id: `${listId}-${String(i).padStart(4, '0')}`,
        list_id: listId,
        actor_email: 'a@b.c',
        item_name: 'milk',
        action: 'updated',
        payload: '',
        created_at: `2026-01-01T00:00:00.${String(i).padStart(3, '0')}Z`
      }))
    );
  };

  it('keeps nothing back when under the limit', async () => {
    await seed('l1', 5);
    expect(await pruneLogs('l1', LOCAL_LOG_LIMIT)).toBe(0);
    expect(await db.logs.count()).toBe(5);
  });

  it('trims to the limit, keeping the newest', async () => {
    await seed('l1', LOCAL_LOG_LIMIT + 10);
    const deleted = await pruneLogs('l1', LOCAL_LOG_LIMIT);

    expect(deleted).toBe(10);
    expect(await db.logs.count()).toBe(LOCAL_LOG_LIMIT);

    const remaining = await db.logs.orderBy('created_at').toArray();
    expect(remaining[remaining.length - 1]!.id).toBe(
      `l1-${String(LOCAL_LOG_LIMIT + 9).padStart(4, '0')}`
    );
  });

  it('only prunes the list it was asked about', async () => {
    await seed('l1', LOCAL_LOG_LIMIT + 5);
    await seed('l2', 3);

    await pruneLogs('l1', LOCAL_LOG_LIMIT);

    expect(await db.logs.where('list_id').equals('l2').count()).toBe(3);
  });
});
