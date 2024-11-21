import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server';

export default defineEventHandler(async (event: any) => {
  const user = await serverSupabaseUser(event);
  const client = await serverSupabaseClient(event);

  if (typeof user === 'undefined' || user === null) {
    return { settings: null };
  }

  const { data } = await client.from('users').select().eq('id', user.id);
  if (data?.length > 0) {
    return { settings: data[0] };
  }
  return { settings: data };
});
