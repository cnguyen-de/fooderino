import { useListStore } from '~/store/list';
import { toast } from 'vue-sonner';

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
  const listStore = useListStore();
  const getInvites = async () => {
    const { data } = await client
      .from('invites')
      .select()
      .eq('status', 'INVITE_PENDING')
      .or(`from.eq.${user.value?.email},to.eq.${user.value?.email}`);

    state.sentInvites = data?.filter((invite) => invite.from === user.value?.email) || [];
    state.receivedInvites = data?.filter((invite) => invite.to === user.value?.email) || [];
  };

  const sendInvite = async (email: string, selectedListId: string) => {
    const { data } = await client.from('users').select('id, email').eq('email', email);
    if (!data || data.length === 0) {
      toast('Failed to send invite', {
        description: `User with ${email} not found`
      });
      console.error('User not found');
    }
    const invitedUser = data[0];
    await client.from('invites').insert({
      to: invitedUser.email,
      from: user.value?.email,
      status: 'INVITE_PENDING',
      list_id: selectedListId
    });
    await getInvites();
    toast('Successfully sent invite', {
      description: `An invite was sent to ${invitedUser.email}`
    });
  };

  const setSelectedInvite = (invite: any) => {
    state.selectedInvite = invite;
  };

  const acceptInvite = async (accept) => {
    const { data } = await useFetch('/api/invite', {
      query: { inviteId: state.selectedInvite.id, status: accept ? 'INVITE_ACCEPTED' : 'INVITE_REJECTED' }
    });
    await listStore.fetchLists();
    await getInvites();
  };

  const removeInvite = async (email) => {
    await client.from('invites').delete().eq('to', email).eq('from', user.value?.email);
    await getInvites();
  };

  return {
    ...toRefs(state),

    getInvites,
    sendInvite,
    setSelectedInvite,
    acceptInvite,
    removeInvite
  };
});
