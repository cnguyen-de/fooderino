interface State {
  isShareListDrawerOpen: boolean;
  isRenameListDrawerOpen: boolean;
  isDeleteListDrawerOpen: boolean;
}
export const useDrawerStore = defineStore('drawers', () => {
  const state = reactive<State>({
    isShareListDrawerOpen: false,
    isRenameListDrawerOpen: false,
    isDeleteListDrawerOpen: false
  });

  return {
    ...toRefs(state)
  };
});
