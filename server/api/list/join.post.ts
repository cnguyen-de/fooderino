import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server';
import { validateToken, type ShareTokenRow } from '~~/utils/join-token';

const REASON: Record<string, string> = {
  missing: 'That share code is not valid.',
  expired: 'That share code has expired. Ask for a new one.',
  revoked: 'That share code was revoked.'
};

export default defineEventHandler(async (event): Promise<{ listId: string; listName: string }> => {
  // Throws "Auth session missing" rather than returning null when signed out.
  const user = await serverSupabaseUser(event).catch(() => null);
  if (!user) throw createError({ statusCode: 401, message: 'Sign in to join a list' });
  if (!user.email) throw createError({ statusCode: 400, message: 'Your account has no email address' });

  const { token } = (await readBody<{ token?: string }>(event)) ?? {};
  if (!token) throw createError({ statusCode: 400, message: 'Missing token' });

  // Service role: the joiner has no RLS access to this list yet, so neither
  // the token lookup nor the membership write can go through their client.
  // This is the only RLS bypass in the app; the token check below is what
  // stands in for the policy. Untyped: `types/database.types.ts` predates v2.
  const admin = serverSupabaseServiceRole(event) as any;

  const { data: tokenRow } = await admin
    .from('list_share_tokens')
    .select('list_id, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle();

  const verdict = validateToken((tokenRow as ShareTokenRow | null) ?? null, new Date());
  if (verdict !== 'ok') throw createError({ statusCode: 403, message: REASON[verdict] });

  const { data: list } = await admin
    .from('lists_v2')
    .select('id, name, deleted_at')
    .eq('id', tokenRow.list_id)
    .maybeSingle();

  if (!list || list.deleted_at) {
    throw createError({ statusCode: 404, message: 'That list no longer exists.' });
  }

  // Lowercased to match `buildMember` and the backfill: `unique (list_id,
  // email)` compares raw text.
  const email = user.email.toLowerCase();

  // Re-scanning a code, or rejoining a list you left, must reuse the existing
  // membership row. An upsert carrying a fresh id would rewrite the primary
  // key, and every device holding the old id would keep a ghost duplicate.
  const { data: existing } = await admin
    .from('list_members')
    .select('id, role')
    .eq('list_id', list.id)
    .eq('email', email)
    .maybeSingle();

  const { error } = await admin.from('list_members').upsert(
    {
      id: existing?.id ?? crypto.randomUUID(),
      list_id: list.id,
      user_id: user.id,
      email,
      name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      avatar: user.user_metadata?.picture ?? null,
      // Never demote: an admin re-scanning their own list's code stays admin.
      role: existing?.role ?? 'member',
      updated_at: new Date().toISOString(),
      deleted_at: null
    },
    { onConflict: 'id' }
  );
  if (error) throw createError({ statusCode: 500, message: 'Could not join the list' });

  return { listId: list.id, listName: list.name };
});
