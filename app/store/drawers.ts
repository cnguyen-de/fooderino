interface State {
  isInviteDrawerOpen: boolean;
}
export const useDrawerStore = defineStore('drawers', () => {
  const state = reactive<State>({
    isInviteDrawerOpen: false
  });

  return {
    ...toRefs(state)
  };
});
