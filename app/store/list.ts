import type { List } from '../../types/List';
interface State {
  lists: List[];
  selectedList: List | null;
}
export const useListStore = defineStore('list', () => {
  const state = reactive<State>({
    lists: [],
    selectedList: null
  });

  const fetchLists = async () => {
    const { data } = await useFetch('/api/list');
    state.lists = data?.value.lists;
    setSelectedList(data?.value.lists[0]);
  };

  const setSelectedList = (list: List) => {
    state.selectedList = list;
  };

  return {
    ...toRefs(state),
    fetchLists
  };
});
