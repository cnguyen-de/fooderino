import type { ListRecord } from '~~/types/sync';

interface State {
  selectedListId: string | null;
}

export const useListStore = defineStore('list', () => {
  const state = reactive<State>({ selectedListId: null });
  const { lists, loading, create, rename, remove, removeMember, membersOf } = useLists();

  const selectedList = computed<ListRecord | null>(
    () => lists.value.find((l) => l.id === state.selectedListId) ?? lists.value[0] ?? null
  );

  const setSelectedList = (list: ListRecord | null) => {
    state.selectedListId = list?.id ?? null;
  };

  const selectedMembers = computed(() =>
    selectedList.value ? membersOf(selectedList.value.id).value : []
  );

  return {
    ...toRefs(state),
    lists,
    isLoading: loading,
    selectedList,
    selectedMembers,
    setSelectedList,
    createList: create,
    renameList: rename,
    deleteList: remove,
    removeUser: removeMember
  };
});
