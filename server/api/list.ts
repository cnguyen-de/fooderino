import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server';

export default defineEventHandler(async (event: any) => {
  const user = await serverSupabaseUser(event);
  const client = await serverSupabaseClient(event);

  if (typeof user === 'undefined' || user === null) {
    return { lists: [], user: null };
  }

  const { data } = await client
    .from('lists')
    .select('uid, id, name, users')
    .contains('users', JSON.stringify([{ email: user.email }]));
  return { lists: data?.sort((a, b) => a.uid - b.uid), user: user.email };
});
