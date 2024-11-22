import type { List } from '../../types/List';
import { useItemStore } from '~/store/item';
import { useInviteStore } from '~/store/invites';
interface State {
  lists: List[];
  selectedList: List | null;
}
export const useListStore = defineStore('list', () => {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();
  const inviteStore = useInviteStore();

  const state = reactive<State>({
    lists: [],
    selectedList: null
  });

  const fetchLists = async () => {
    const { data } = await useFetch('/api/list');
    state.lists = data?.value?.lists;
    setSelectedList(data?.value?.lists[0]);
  };

  const setSelectedList = async (list: List) => {
    state.selectedList = list;
    const itemStore = useItemStore();
    await itemStore.fetchInventoryItems();
    await itemStore.fetchBuyItems();
    await inviteStore.getReceivedInvites();
    await inviteStore.getSentInvites();
  };

  const createList = async (name) => {
    await supabase.from('lists').insert({
      name: name,
      users: [
        {
          email: user.value?.email,
          name: user.value?.user_metadata?.full_name,
          avatar: user.value?.user_metadata?.picture,
          admin: true
        }
      ],
      admin: user.value?.id
    });
    await fetchLists();
  };
  return {
    ...toRefs(state),
    fetchLists,
    createList,
    setSelectedList
  };
});
