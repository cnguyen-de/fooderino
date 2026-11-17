import { createHash, randomBytes } from 'node:crypto';
import { serverSupabaseClient } from '#supabase/server';

const TOKEN_TTL_HOURS = 24;

/**
 * Mints a share token for the caller's household. Multi-use within the window,
 * because a single-use code breaks the common case of sharing with two housemates.
 * Only its hash is stored, so a database read never reveals a usable code.
 */
export default defineEventHandler(async (event): Promise<{ token: string; url: string; expiresAt: string }> => {
  const user = await requireUser(event, 'share your household');
  // The caller's own client, so RLS enforces membership: a non-member's insert is
  // refused by the policy rather than by a check written here.
  const client = (await serverSupabaseClient(event)) as any;

  const { data: household, error: lookup } = await client.rpc('my_household');
  if (lookup) throw createError({ statusCode: 500, message: 'Could not find your household.' });
  if (!household) throw createError({ statusCode: 409, message: 'You are not in a household.' });

  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600_000).toISOString();
  const { error } = await client.from('household_share_tokens').insert({
    token_hash: createHash('sha256').update(token, 'utf8').digest('hex'),
    household_id: household,
    created_by: user.id,
    expires_at: expiresAt
  });
  if (error) throw createError({ statusCode: 403, message: 'You cannot share this household.' });

  const base = useRuntimeConfig().public.baseUrl;
  return { token, url: `${base}/join?t=${token}`, expiresAt };
});
