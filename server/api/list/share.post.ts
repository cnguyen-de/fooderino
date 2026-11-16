import { randomBytes } from 'node:crypto';
import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server';

const TOKEN_TTL_HOURS = 24;

/**
 * Mints a multi-use share token for a list. Multi-use within the window,
 * because a single-use code breaks the common case of sharing one list with
 * two housemates.
 */
export default defineEventHandler(
  async (event): Promise<{ token: string; url: string; expiresAt: string }> => {
    // Throws "Auth session missing" rather than returning null when signed out.
    const user = await serverSupabaseUser(event).catch(() => null);
    if (!user) throw createError({ statusCode: 401, message: 'Sign in to share a list' });

    const { listId } = (await readBody<{ listId?: string }>(event)) ?? {};
    if (!listId) throw createError({ statusCode: 400, message: 'Missing listId' });

    // The caller's own client, so RLS enforces membership: a non-member's
    // insert is rejected by the policy rather than by a check written here.
    // Untyped: `types/database.types.ts` predates the v2 tables.
    const client = (await serverSupabaseClient(event)) as any;

    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600_000).toISOString();

    const { error } = await client.from('list_share_tokens').insert({
      token,
      list_id: listId,
      created_by: user.id,
      expires_at: expiresAt
    });
    if (error) throw createError({ statusCode: 403, message: 'You cannot share this list' });

    const base = useRuntimeConfig().public.baseUrl;
    return { token, url: `${base}/join?t=${token}`, expiresAt };
  }
);
