import { liveQuery } from 'dexie';
import type { ComputedRef, Ref } from 'vue';
import type { HouseholdId, HouseholdRow, MemberRow } from '~~/types/pantry';
import type { Candidate, HouseholdStatus } from '~~/utils/household-move';
import { readSyncState } from '~~/utils/sync-state';
import { db } from '~~/utils/db';

export type { Candidate } from '~~/utils/household-move';

export interface Household {
  id: HouseholdId;
  name: string;
}

export interface Member {
  id: string;
  user_id: string | null;
  email: string;
  name: string | null;
  avatar: string | null;
  role: 'admin' | 'member';
}

export type HouseholdState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'choosing'; candidates: Candidate[] }
  | { kind: 'member'; household: Household; members: Member[] };

/** What a join or pick brought along. */
export interface MoveSummary {
  household_id: HouseholdId | null;
  merged: number;
  copied: number;
  bag: number;
}

export interface ShareCode {
  token: string;
  url: string;
  expiresAt: string;
}

interface Local {
  household: HouseholdRow | null;
  members: MemberRow[];
}

// Module-level: one subscription to the device's household and one server status, shared.
const local = shallowRef<Local | null>(null);
const remote = shallowRef<HouseholdStatus | null>(null);
const error = ref<string | null>(null);
let started = false;

/** Request ids by gesture, so a retry after a dropped response replays the first result. */
const inflight = new Map<string, string>();

function toMember({ id, user_id, email, name, avatar, role }: MemberRow): Member {
  return { id, user_id, email, name, avatar, role };
}

async function readLocal(): Promise<Local> {
  const { household_id } = await readSyncState(db);
  if (!household_id) return { household: null, members: [] };
  const [household, members] = await Promise.all([
    db.households.get(household_id),
    db.members.filter((m) => m.household_id === household_id && m.deleted_at === null).toArray()
  ]);
  return { household: household && !household.deleted_at ? household : null, members };
}

const state = computed<HouseholdState>(() => {
  const here = local.value?.household;
  if (here) {
    return {
      kind: 'member',
      household: { id: here.id, name: here.name },
      members: (local.value?.members ?? []).map(toMember)
    };
  }
  const there = remote.value;
  if (!there || there.state === 'member') return { kind: 'loading' };
  return there.state === 'choosing' ? { kind: 'choosing', candidates: there.candidates } : { kind: 'none' };
});

/** A `$fetch` error's server message, or a generic one. */
function messageOf(e: unknown, fallback: string): string {
  const data = (e as { data?: { message?: string } })?.data;
  return data?.message ?? fallback;
}

/** Fails without a status when the request never got an answer. */
function statusOf(e: unknown): number | null {
  return (e as { statusCode?: number })?.statusCode ?? (e as { status?: number })?.status ?? null;
}

export interface HouseholdApi {
  state: ComputedRef<HouseholdState>;
  /** The last action's failure, for the UI to show. */
  error: Ref<string | null>;
  /** Re-reads this user's standing from the server. */
  refresh(): Promise<void>;
  create(name: string): Promise<MoveSummary>;
  /** `bring` defaults to true: your items come along and merge by name. */
  join(token: string, options?: { bring?: boolean }): Promise<MoveSummary>;
  pick(id: HouseholdId, options?: { import?: HouseholdId[] }): Promise<MoveSummary>;
  leave(): Promise<MoveSummary>;
  share(): Promise<ShareCode>;
}

export function useHousehold(): HouseholdApi {
  const { flush, checkMembership } = useSyncEngine();

  async function refresh(): Promise<void> {
    try {
      remote.value = await $fetch<HouseholdStatus>('/api/household/status');
      error.value = null;
      if (remote.value.state === 'member' && !local.value?.household) await checkMembership();
    } catch (e) {
      error.value = messageOf(e, 'Could not reach the server.');
    }
  }

  if (!started && typeof window !== 'undefined') {
    started = true;
    liveQuery(readLocal).subscribe({
      next: (next) => {
        local.value = next;
        if (!next.household) void refresh();
      },
      error: (e) => console.error('useHousehold:', e)
    });
  }

  /** Changes waiting for the old household must land before the membership moves away from it. */
  async function settleOutbox(): Promise<void> {
    await flush();
    if ((await db.commands.count()) > 0) {
      throw new Error('Some changes have not synced yet. Connect to the internet and try again.');
    }
  }

  async function move(path: string, key: string, body: Record<string, unknown>): Promise<MoveSummary> {
    const request_id = inflight.get(key) ?? crypto.randomUUID();
    inflight.set(key, request_id);
    try {
      const result = await $fetch<MoveSummary>(path, {
        method: 'POST',
        body: { ...body, request_id },
        retry: 2,
        retryDelay: 500,
        retryStatusCodes: [408, 425, 429, 500, 502, 503, 504]
      });
      inflight.delete(key);
      error.value = null;
      return result;
    } catch (e) {
      const status = statusOf(e);
      // A definite answer is final; only a lost or failed request keeps its id for the next try.
      if (status !== null && status >= 400 && status < 500) inflight.delete(key);
      error.value = messageOf(e, 'Could not reach the server.');
      throw e;
    } finally {
      // The server may have moved this user even when the answer was lost.
      await checkMembership();
      await refresh();
    }
  }

  return {
    state,
    error,
    refresh,
    create: (name) => move('/api/household/create', `create:${name}`, { name }),
    async join(token, { bring = true } = {}) {
      await settleOutbox();
      return move('/api/household/join', `join:${token}:${bring}`, { token, bring });
    },
    pick: (id, { import: from = [] } = {}) =>
      move('/api/household/pick', `pick:${id}:${from.join(',')}`, { household: id, import: from }),
    async leave() {
      await settleOutbox();
      return move('/api/household/leave', 'leave', {});
    },
    share: () => $fetch<ShareCode>('/api/household/share', { method: 'POST' })
  };
}

