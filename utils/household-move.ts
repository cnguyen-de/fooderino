import type { SupabaseClient } from '@supabase/supabase-js';
import type { HouseholdId } from '~~/types/pantry';

/** The membership moves `move_household` performs, and the arguments each takes. */
export type MoveRequest =
  | { action: 'create'; args: { name: string } }
  | { action: 'join'; args: { token: string; bring: boolean } }
  | { action: 'pick'; args: { household: HouseholdId; import: HouseholdId[] } }
  | { action: 'leave'; args: Record<string, never> };

export type MoveFailure =
  | 'already_member'
  | 'invalid_name'
  | 'missing'
  | 'revoked'
  | 'expired'
  | 'household_gone'
  | 'not_candidate'
  | 'not_member';

export type MoveOutcome =
  | { ok: true; household_id: HouseholdId | null; merged: number; copied: number; bag: number }
  | { ok: false; reason: MoveFailure };

const FAILURES: readonly MoveFailure[] = [
  'already_member',
  'invalid_name',
  'missing',
  'revoked',
  'expired',
  'household_gone',
  'not_candidate',
  'not_member'
];

/** HTTP status and message per failure, for the Nitro handlers. */
export const MOVE_FAILURE: Record<MoveFailure, { status: number; message: string }> = {
  already_member: { status: 409, message: 'You already belong to a household. Leave it first.' },
  invalid_name: { status: 400, message: 'Give your household a name.' },
  missing: { status: 404, message: 'That share code is not valid.' },
  revoked: { status: 410, message: 'That share code was revoked.' },
  expired: { status: 410, message: 'That share code has expired. Ask for a new one.' },
  household_gone: { status: 410, message: 'That household no longer exists.' },
  not_candidate: { status: 403, message: 'You cannot pick that household.' },
  not_member: { status: 409, message: 'You are not in a household.' }
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Parses a request body into a move, or names the field that is wrong. */
export function parseMove(
  action: MoveRequest['action'],
  body: unknown
): { request_id: string; move: MoveRequest } | { error: string } {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (!isUuid(b.request_id)) return { error: 'request_id must be a uuid' };
  const request_id = b.request_id.toLowerCase();
  switch (action) {
    case 'create':
      if (typeof b.name !== 'string') return { error: 'name must be a string' };
      return { request_id, move: { action, args: { name: b.name } } };
    case 'join':
      if (typeof b.token !== 'string' || b.token === '') return { error: 'token must be a string' };
      if (b.bring !== undefined && typeof b.bring !== 'boolean') return { error: 'bring must be a boolean' };
      return { request_id, move: { action, args: { token: b.token, bring: b.bring ?? true } } };
    case 'pick': {
      const imports = b.import ?? [];
      if (!isUuid(b.household)) return { error: 'household must be a uuid' };
      if (!Array.isArray(imports) || !imports.every(isUuid)) return { error: 'import must be a list of uuids' };
      return {
        request_id,
        move: { action, args: { household: b.household as HouseholdId, import: imports as HouseholdId[] } }
      };
    }
    case 'leave':
      return { request_id, move: { action, args: {} } };
  }
}

/**
 * Runs one move through `move_household` as the service role. `userId` must come from
 * a verified JWT: the RPC trusts it. A retried `requestId` returns the first result.
 */
export async function runMove(
  admin: SupabaseClient,
  userId: string,
  requestId: string,
  { action, args }: MoveRequest
): Promise<MoveOutcome> {
  const { data, error } = await admin.rpc('move_household', {
    p_request_id: requestId,
    p_user_id: userId,
    p_action: action,
    p_args: args
  });
  if (error) throw new Error(`move_household ${action}: ${error.message}`);
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.status === 'error' && FAILURES.includes(r.reason as MoveFailure)) {
    return { ok: false, reason: r.reason as MoveFailure };
  }
  if (r.status !== 'ok') throw new Error(`move_household ${action}: unexpected result ${JSON.stringify(data)}`);
  const count = (v: unknown) => (typeof v === 'number' ? v : 0);
  return {
    ok: true,
    household_id: isUuid(r.household_id) ? (r.household_id as HouseholdId) : null,
    merged: count(r.merged),
    copied: count(r.copied),
    bag: count(r.bag)
  };
}

export interface Candidate {
  household_id: HouseholdId;
  name: string;
  role: 'admin' | 'member';
}

export type HouseholdStatus =
  | { state: 'none' }
  | { state: 'choosing'; candidates: Candidate[] }
  | { state: 'member'; household: { id: HouseholdId; name: string } };

/**
 * Where this user stands. Read with the service role because candidates may not read
 * the households they choose between until they pick one.
 */
export async function readHouseholdStatus(
  admin: SupabaseClient,
  user: { id: string; email?: string | null }
): Promise<HouseholdStatus> {
  const membership = await admin
    .from('household_members')
    .select('household_id, households(id, name)')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (membership.error) throw new Error(`status membership: ${membership.error.message}`);
  const home = membership.data?.households as unknown as { id: HouseholdId; name: string } | null | undefined;
  if (home) return { state: 'member', household: { id: home.id, name: home.name } };

  const email = (user.email ?? '').trim().toLowerCase();
  const mine = email ? `user_id.eq.${user.id},and(user_id.is.null,email.eq."${email}")` : `user_id.eq.${user.id}`;
  const open = await admin
    .from('household_candidates')
    .select('household_id, role, households(name, deleted_at)')
    .is('consumed_at', null)
    .or(mine);
  if (open.error) throw new Error(`status candidates: ${open.error.message}`);
  const candidates = (open.data ?? []).flatMap((row) => {
    const h = row.households as unknown as { name: string; deleted_at: string | null } | null;
    return h && !h.deleted_at ? [{ household_id: row.household_id as HouseholdId, name: h.name, role: row.role as Candidate['role'] }] : [];
  });
  return candidates.length > 0 ? { state: 'choosing', candidates } : { state: 'none' };
}
