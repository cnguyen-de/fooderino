import type { List } from '../../types/List';
import { useItemStore } from '~/store/item';
import { useInviteStore } from '~/store/invites';
interface State {
  lists: List[];
  selectedList: List | null;
  isLoading: boolean;
}
export const useListStore = defineStore('list', () => {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();
  const inviteStore = useInviteStore();

  const state = reactive<State>({
    lists: [],
    selectedList: null,
    isLoading: false
  });

  const fetchLists = async () => {
    // Only show loading if no lists are cached yet
    const hasNoLists = state.lists.length === 0;
    if (hasNoLists) {
      state.isLoading = true;
    }
    try {
      const { data } = await useFetch('/api/list');
      state.lists = data?.value?.lists;
      if (!state.selectedList) {
        setSelectedList(state.lists[0]);
      }
    } finally {
      if (hasNoLists) {
        state.isLoading = false;
      }
    }
  };

  const setSelectedList = async (list: List | null) => {
    state.selectedList = list;
    const itemStore = useItemStore();
    if (!list) {
      itemStore.inventoryItems = [];
      itemStore.buyItems = [];
      itemStore.allItems = [];
      itemStore.buyItemsFromAllLists = [];
    }
    await itemStore.fetchItems();
    await inviteStore.getInvites();
  };

  const createList = async (name: string) => {
    const newList = await supabase
      .from('lists')
      .insert({
        name,
        users: [
          {
            email: user.value?.email,
            name: user.value?.user_metadata?.full_name,
            avatar: user.value?.user_metadata?.picture,
            admin: true
          }
        ],
        admin: user.value?.id
      })
      .select();
    setSelectedList(newList.data[0]);
    await fetchLists();
  };

  const renameList = async (name: string) => {
    await supabase.from('lists').update({ name }).eq('id', state.selectedList.id);
    await fetchLists();
    state.selectedList.name = name;
  };

  const deleteList = async (id: string) => {
    await supabase.from('lists').delete().eq('id', id);
    setSelectedList(state.lists[0]);
    await fetchLists();
  };

  const removeUser = async (email) => {
    if (state.selectedList.admin !== user.value?.id) {
      return;
    }
    await supabase
      .from('lists')
      .update({
        users: state.selectedList.users.filter((user) => user.email !== email)
      })
      .eq('id', state.selectedList.id);
    await fetchLists();
  };
  return {
    ...toRefs(state),
    fetchLists,
    createList,
    renameList,
    deleteList,
    setSelectedList,
    removeUser
  };
});
