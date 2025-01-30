import type { Command } from '~~/types/Command';
import type { Item } from '~~/types/Item';
import { useStorage } from '@vueuse/core';

interface State {
  actions: Command[];
  currentActionIndex: number;
  purchasedItems: Item[];
}

export const useActionStore = defineStore('actions', () => {
  const state = reactive<State>({
    actions: [],
    currentActionIndex: -1,
    purchasedItems: []
  });
  const purchasedItems = useStorage('purchasedItem', []);
  state.purchasedItems = purchasedItems.value;
  watch(
    () => state.purchasedItems,
    (value) => {
      purchasedItems.value = value;
    }
  );
  const redoable = computed(() => {
    return state.currentActionIndex < state.actions.length - 1;
  });

  const undoable = computed(() => {
    return state.actions.length > 0 && state.currentActionIndex > -1;
  });

  const addAction = (action: Command) => {
    if (state.currentActionIndex !== state.actions.length - 1) {
      state.actions.splice(state.currentActionIndex + 1, state.actions.length - state.currentActionIndex - 1);
      state.currentActionIndex = state.actions.length - 1;
    }
    state.actions.push(action);
    state.currentActionIndex++;
    switch (action.type) {
      case 'purchase':
        state.purchasedItems.push(action.payload);
        break;
    }
  };
  /**
   * Undo the last action
   * Current Index moves up 1 and last purchased item is removed (assuming last action is an purchase command).
   */
  const undo = () => {
    if (state.currentActionIndex === -1) {
      state.currentActionIndex = state.actions.length - 1;
    } else {
      state.currentActionIndex--;
    }
    state.purchasedItems.pop();
  };

  /**
   * Redo the last action
   * Re-add the item at the index position, assuming item was a purchase command and "redo" removed it from the purchasedItems array )
   * Current Index moves down 1.
   */
  const redo = () => {
    state.purchasedItems.push(state.actions[state.currentActionIndex + 1].payload);
    state.currentActionIndex++;
  };

  return {
    ...toRefs(state),
    // Actions
    addAction,
    undo,
    redo,

    // Getters
    redoable,
    undoable
  };
});
