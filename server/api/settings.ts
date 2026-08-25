import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server';

export interface AIQuota {
  ai: boolean;
  free_ai_calls: number;
}

/**
 * Returns only the server-owned quota. Everything else lives in
 * `user_settings` and syncs to the client like any other record.
 */
export default defineEventHandler(async (event: any): Promise<{ quota: AIQuota | null }> => {
  const user = await serverSupabaseUser(event);
  const client = await serverSupabaseClient(event);

  if (!user) return { quota: null };

  const { data } = await client.from('users').select('ai, free_ai_calls').eq('id', user.id);
  // Cast: `types/database.types.ts` is stale (regenerating it is deferred to the
  // human pass), so the row comes back untyped and `$fetch` would infer `{}`.
  const row = (data?.[0] ?? null) as { ai: boolean | null; free_ai_calls: number | null } | null;
  if (!row) return { quota: null };

  return { quota: { ai: !!row.ai, free_ai_calls: row.free_ai_calls ?? 0 } };
});
