import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server';

export default defineEventHandler(async (event: any) => {
  const user = await serverSupabaseUser(event);
  const client = await serverSupabaseClient(event);

  if (typeof user === 'undefined' || user === null) {
    return { settings: null };
  }
  const reqQuery = getQuery(event);
  const { inviteId, status } = reqQuery;
  // Update Invite object status
  const { data } = await client.from('invites').select().eq('id', inviteId);
  const updateInvite = await client.from('invites').update({ status }).eq('id', inviteId);
  // Update List
  if (status === 'INVITE_REJECTED') {
    return {};
  }
  const list = await client.from('lists').select().eq('id', data[0].list_id);
  const newUsers = [
    ...list.data[0].users,
    { name: user.user_metadata.name, email: user.email, avatar: user.user_metadata.picture }
  ];
  const updateList = await client.from('lists').update({ users: newUsers }).eq('id', list.data[0].id);
  return {};
});
