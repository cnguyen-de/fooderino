import type { List } from '../../types/List';
import { useItemStore } from '~/store/item';
interface State {
  lists: List[];
  selectedList: List | null;
}
export const useListStore = defineStore('list', () => {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();
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
  };

  const createList = async (name) => {
    await supabase.from('lists').insert({
      name: name,
      users: [
        {
          email: user.value?.email,
          name: user.value?.user_metadata?.full_name,
          avatar: user.value?.user_metadata?.picture
        }
      ]
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
