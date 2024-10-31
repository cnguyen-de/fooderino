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
    const res = await useFetch('/api/list', {
      headers: useRequestHeaders(['cookie'])
    });
    state.lists = res.data;
    return res.data;
  };

  return {
    ...toRefs(state),
    fetchLists
  };
});
