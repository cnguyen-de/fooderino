import { liveQuery } from 'dexie';
import { db } from '~~/utils/db';
import { notifyLocalChange } from '~~/utils/sync-hook';
import { buildList, buildMember, type MemberIdentity } from '~~/utils/list-ops';
import type { ListRecord, ListMemberRecord } from '~~/types/sync';

// Module-level, not per-mount: one live subscription shared by every component,
// so data is already populated when a page mounts. Per-mount refs made each
// navigation flash an empty state before the async liveQuery fired.
const lists = ref<ListRecord[]>([]);
const members = ref<ListMemberRecord[]>([]);
const loading = ref(true);
let started = false;

function ensureStarted(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  liveQuery(() => db.lists.filter((l) => l.deleted_at === null).toArray()).subscribe({
    next: (rows) => {
      lists.value = rows.sort((a, b) => a.name.localeCompare(b.name));
      loading.value = false;
    },
    error: (e) => {
      loading.value = false;
      console.error('useLists:', e);
    }
  });

  liveQuery(() => db.list_members.filter((m) => m.deleted_at === null).toArray()).subscribe({
    next: (rows) => {
      members.value = rows;
    },
    error: (e) => console.error('useLists members:', e)
  });
}

export function useLists() {
  const user = useSupabaseUser();

  onBeforeMount(ensureStarted);

  async function create(name: string, owner: MemberIdentity): Promise<string> {
    if (!owner.id) throw new Error('Cannot create a list without a signed-in user');
    const list = buildList(name, owner.id);
    const member = buildMember(list.id, owner, 'admin');

    await db.transaction('rw', db.lists, db.list_members, async () => {
      await db.lists.add(list);
      await db.list_members.add(member);
    });

    notifyLocalChange('lists', list.id);
    notifyLocalChange('list_members', member.id);
    return list.id;
  }

  async function rename(id: string, name: string): Promise<void> {
    await db.lists.update(id, { name, updated_at: new Date().toISOString() });
    notifyLocalChange('lists', id);
  }

  /** Soft delete, so the removal reaches other devices. */
  async function remove(id: string): Promise<void> {
    const now = new Date().toISOString();
    await db.lists.update(id, { deleted_at: now, updated_at: now });
    notifyLocalChange('lists', id);
  }

  /**
   * Throws rather than no-oping when the caller may not do this.
   *
   * The `list_members` UPDATE policy admits only the list's owner or the
   * member themselves. A silent bail would soft-delete the row locally, blank
   * it out of the UI, and then have the push rejected — so the member would
   * reappear on the next pull with a success toast already shown.
   */
  async function removeMember(listId: string, email: string): Promise<void> {
    const row = members.value.find((m) => m.list_id === listId && m.email === email);
    if (!row) return;

    const me = user.value;
    const isOwner = !!me?.id && lists.value.find((l) => l.id === listId)?.owner === me.id;
    const isSelf = !!me?.email && me.email.toLowerCase() === email.toLowerCase();
    if (!isOwner && !isSelf) {
      throw new Error('Only the list owner can remove another member');
    }

    const now = new Date().toISOString();
    await db.list_members.update(row.id, { deleted_at: now, updated_at: now });
    notifyLocalChange('list_members', row.id);
  }

  function membersOf(listId: string) {
    return computed(() => members.value.filter((m) => m.list_id === listId));
  }

  return { lists, members, loading, create, rename, remove, removeMember, membersOf };
}
