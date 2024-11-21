export const useInviteStore = defineStore('invite', () => {
  interface State {
    sentInvites: any;
    receivedInvites: any;
    selectedInvite: any;
  }

  const state = reactive<State>({
    sentInvites: [],
    receivedInvites: [],
    selectedInvite: null
  });

  const client = useSupabaseClient();
  const user = useSupabaseUser();

  const getSentInvites = async () => {
    const { data } = await client.from('invites').select().eq('from', user.value?.email).eq('status', 'INVITE_PENDING');
    state.sentInvites = data;
  };
  const getReceivedInvites = async () => {
    const { data } = await client.from('invites').select().eq('to', user.value?.email).eq('status', 'INVITE_PENDING');
    state.receivedInvites = data;
  };

  const sendInvite = async (email: string, selectedListId: string) => {
    const { data } = await client.from('users').select('id, email').eq('email', email);
    if (!data || data.length === 0) {
      console.log('User not found');
      return;
    }
    const invitedUser = data[0];
    await client.from('invites').insert({
      to: invitedUser.email,
      from: user.value?.email,
      status: 'INVITE_PENDING',
      list_id: selectedListId
    });
    await getSentInvites();
  };

  const setSelectedInvite = (invite: any) => {
    state.selectedInvite = invite;
  };

  const acceptInvite = async (accept) => {
    const { data } = await useFetch('/api/invite', {
      query: { inviteId: state.selectedInvite.id, status: accept ? 'INVITE_ACCEPTED' : 'INVITE_REJECTED' }
    });
  };

  return {
    ...toRefs(state),

    getReceivedInvites,
    getSentInvites,
    sendInvite,
    setSelectedInvite,
    acceptInvite
  };
});
