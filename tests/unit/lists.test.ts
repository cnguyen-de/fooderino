import { describe, it, expect } from 'vitest';
import { buildList, buildMember } from '~~/utils/list-ops';

describe('buildList', () => {
  it('mints a uuid, stamps updated_at and leaves the tombstone empty', () => {
    const list = buildList('Groceries', 'user-a');
    expect(list.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(list.name).toBe('Groceries');
    expect(list.owner).toBe('user-a');
    expect(list.deleted_at).toBeNull();
    expect(list.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});

describe('buildMember', () => {
  it('makes the creator an admin', () => {
    const m = buildMember(
      'list-1',
      { id: 'user-a', email: 'a@b.c', name: 'A', avatar: null },
      'admin'
    );
    expect(m.role).toBe('admin');
    expect(m.list_id).toBe('list-1');
    expect(m.user_id).toBe('user-a');
    expect(m.email).toBe('a@b.c');
  });

  it('defaults an invited person to member', () => {
    const m = buildMember(
      'list-1',
      { id: 'user-b', email: 'b@b.c', name: 'B', avatar: null },
      'member'
    );
    expect(m.role).toBe('member');
  });

  it('lowercases the email, matching the backfill and the unique constraint', () => {
    const m = buildMember(
      'list-1',
      { id: 'user-c', email: 'Mixed.Case@Example.COM', name: 'C', avatar: null },
      'member'
    );
    expect(m.email).toBe('mixed.case@example.com');
  });
});
