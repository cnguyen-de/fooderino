<script setup>
import { useItemStore } from '~/store/item';
import { ArrowLeft, ChevronRight, Undo, Redo, CircleCheck, ShoppingBasket } from 'lucide-vue-next';
import { useStorage } from '@vueuse/core';
import { useActionStore } from '~/store/actions';

const itemStore = useItemStore();
const actionStore = useActionStore();
itemStore.showBuyItemsFromAllLists = true;
itemStore.fetchItems();
const { showBuyItemsFromAllLists } = toRefs(itemStore);
const categories = computed(() => {
  let stores = itemStore?.buyItemsFromAllLists
    ?.filter((item) => !actionStore.purchasedItems.some((i) => i.id === item.id))
    .map((item) => item.store.trim());
  return [...new Set(stores)].sort((a, b) => a.localeCompare(b));
});
const storeOpenMap = useStorage('storeOpenMap', {});

const updateStoreMap = (category, isOpen) => {
  storeOpenMap.value[category] = isOpen;
  localStorage.setItem('storeOpenMap', storeOpenMap.toString());
};

const shoppingItems = computed(() => {
  if (showBuyItemsFromAllLists.value) {
    return itemStore.getFilteredAllBuyItems;
  }
  return itemStore.getFilteredShoppingItems;
});

const onAddItemToInventory = (item) => {
  const action = {
    type: 'purchase',
    payload: item
  };
  actionStore.addAction(action);
};

const onItemValueChanged = (item) => {
  itemStore.updateItem(item);
};

onUnmounted(() => {
  itemStore.showBuyItemsFromAllLists = false;
});
</script>
<template>
  <NuxtLayout name="app">
    <div class="flex flex-row items-center px-2">
      <NuxtLink to="/buy">
        <Button variant="ghost"><ArrowLeft></ArrowLeft></Button>
      </NuxtLink>
      <h1 class="ml-2 text-xl font-bold">Shopping List</h1>
      <span class="grow"></span>
      <div class="flex flex-row gap-2">
        <Button class="p-1 px-2" variant="ghost" :disabled="!actionStore.undoable" @click="actionStore.undo()">
          <Undo class="size-5"></Undo>
        </Button>
        <Button class="p-1 px-2" variant="ghost" :disabled="!actionStore.redoable" @click="actionStore.redo()">
          <Redo class="size-5"></Redo>
        </Button>
      </div>
    </div>
    <div class="h-[calc(100%_-_16rem)] w-full overflow-auto">
      <div v-for="category in categories" :key="category">
        <Collapsible :open="storeOpenMap[category]" @update:open="updateStoreMap(category, $event)">
          <div class="flex flex-row pr-4">
            <CollapsibleTrigger class="group/collapsible flex flex-row py-2">
              <h2 class="pl-4 pr-2 text-lg font-bold">{{ category }}</h2>
              <ChevronRight
                class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </CollapsibleTrigger>
            <span class="flex-grow"></span>
            <CreateNewItem :store="category"></CreateNewItem>
          </div>
          <CollapsibleContent>
            <BuyList
              :items="
                shoppingItems
                  ?.filter(
                    (item) => item.store === category && !actionStore.purchasedItems.some((i) => i.id === item.id)
                  )
                  .sort((a, b) => b.times_updated - a.times_updated || a.name.localeCompare(b?.name))
              "
              @item-value-changed="onItemValueChanged($event)"
              @add-item-to-inventory="onAddItemToInventory($event)">
              ></BuyList
            >
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
    <div
      v-if="actionStore.purchasedItems.length > 0"
      class="fixed bottom-16 w-full rounded-t-2xl bg-white/50 p-4 pb-2 dark:bg-gray-400/10">
      <div class="flex w-full flex-col gap-1">
        <div class="flex flex-row items-center">
          <h2 class="text-lg font-bold">
            <ShoppingBasket class="mr-1 inline size-5"></ShoppingBasket> Shopping basket
          </h2>
          <div class="grow"></div>
          <div class="size-6 rounded-full bg-gray-100 pt-[1px] text-center text-sm font-bold dark:bg-gray-700">
            {{ actionStore.purchasedItems.length }}
          </div>
        </div>

        <div v-for="item in actionStore.purchasedItems">
          <div class="flex flex-row items-center gap-2">
            <div class="grow rounded-lg bg-white px-3 py-1.5 dark:bg-gray-700/20">
              {{ item.name }}
            </div>
            <NumberField
              :step="1"
              class="w-20 rounded-lg bg-white dark:bg-gray-700/20"
              :id="item.name"
              :default-value="item.amount_to_purchase"
              :model-value="item.amount_to_purchase"
              @update:model-value="item.amount_to_purchase = $event"
              :min="0">
              <NumberFieldContent>
                <NumberFieldInput class="peer border-none text-base" />
                <NumberFieldDecrement
                  class="rounded-full px-1 text-gray-800/50 peer-focus:text-gray-900/50 dark:text-gray-300/50 dark:peer-focus:text-gray-200/50" />
                <NumberFieldIncrement
                  class="rounded-full px-1 text-gray-800/50 peer-focus:text-gray-900/50 dark:text-gray-300/50 dark:peer-focus:text-gray-200/50" />
              </NumberFieldContent>
            </NumberField>
          </div>
        </div>
      </div>
      <div class="mt-2 flex flex-row justify-between">
        <Button variant="ghost" @click="actionStore.clearPurchasedItems()">Clear</Button>
        <Button @click="actionStore.confirmPurchasing()"
          >Confirm <CircleCheck class="ml-1 size-4"></CircleCheck
        ></Button>
      </div>
    </div>
  </NuxtLayout>
</template>
