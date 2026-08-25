import type { ListRecord, ListMemberRecord } from '~~/types/sync';

export interface MemberIdentity {
  id: string | null;
  email: string;
  name: string | null;
  avatar: string | null;
}

export function buildList(name: string, ownerId: string): ListRecord {
  return {
    id: crypto.randomUUID(),
    name,
    owner: ownerId,
    updated_at: new Date().toISOString(),
    deleted_at: null
  };
}

export function buildMember(
  listId: string,
  who: MemberIdentity,
  role: 'admin' | 'member'
): ListMemberRecord {
  return {
    id: crypto.randomUUID(),
    list_id: listId,
    user_id: who.id,
    // Lowercased deliberately. `unique (list_id, email)` compares raw text, and
    // both the backfill and the join endpoint store the lowercase form — a
    // mixed-case address here would miss that conflict target and produce a
    // second membership row for the same person.
    email: who.email.toLowerCase(),
    name: who.name,
    avatar: who.avatar,
    role,
    updated_at: new Date().toISOString(),
    deleted_at: null
  };
}
