import type { H3Event } from 'h3';
import type { User } from '@supabase/supabase-js';
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server';
import { MOVE_FAILURE, parseMove, runMove, type MoveRequest } from '~~/utils/household-move';

/** The verified user, or a 401. */
export async function requireUser(event: H3Event, doing: string): Promise<User> {
  // Throws "Auth session missing" rather than returning null when signed out.
  const user = await serverSupabaseUser(event).catch(() => null);
  if (!user) throw createError({ statusCode: 401, message: `Sign in to ${doing}` });
  return user;
}

/**
 * Parses the body, runs the move as the service role for the verified user, and maps
 * a refused move to its HTTP status. This is the only path that writes memberships.
 */
export async function handleMove(event: H3Event, action: MoveRequest['action'], doing: string) {
  const user = await requireUser(event, doing);
  const parsed = parseMove(action, await readBody(event).catch(() => null));
  if ('error' in parsed) throw createError({ statusCode: 400, message: parsed.error });
  // Service role: move_household is granted to nobody else, and it trusts the user id it is given.
  const admin = serverSupabaseServiceRole(event) as any;
  const outcome = await runMove(admin, user.id, parsed.request_id, parsed.move).catch((e: unknown) => {
    console.error('[household]', e);
    throw createError({ statusCode: 500, message: 'Could not update your household. Try again.' });
  });
  if (!outcome.ok) {
    const { status, message } = MOVE_FAILURE[outcome.reason];
    throw createError({ statusCode: status, message, data: { reason: outcome.reason } });
  }
  return outcome;
}
