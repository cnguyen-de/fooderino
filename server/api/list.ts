import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server';

export default defineEventHandler(async (event: any) => {
  const user = await serverSupabaseUser(event);
  const client = await serverSupabaseClient(event);

  if (typeof user === 'undefined' || user === null) {
    return { lists: [], user: null };
  }

  const { data } = await client.from('lists').select('id, name').containedBy('users', [user.email]);
  return { lists: data };
});
