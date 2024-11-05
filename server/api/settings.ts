import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server';

export default defineEventHandler(async (event: any) => {
  const user = await serverSupabaseUser(event);
  const client = await serverSupabaseClient(event);

  if (typeof user === 'undefined' || user === null) {
    return { settings: null };
  }

  const { data } = await client.from('users').select().eq('uid', user.id);
  return { settings: data };
});
