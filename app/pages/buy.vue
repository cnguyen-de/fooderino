<script setup>
import { useItemStore } from '~/store/item';
import { ChevronRight } from 'lucide-vue-next';
import { useStorage } from '@vueuse/core';
import { useListStore } from '~/store/list';
const itemStore = useItemStore();
const listStore = useListStore();
itemStore.fetchItems();
const { showBuyItemsFromAllLists } = toRefs(itemStore);
const categories = computed(() => {
  let stores = itemStore?.purchasedItems?.map((item) => item.store.trim());
  if (showBuyItemsFromAllLists.value) {
    stores = itemStore?.buyItemsFromAllLists?.map((item) => item.store.trim());
  }
  return [...new Set(stores)].sort((a, b) => a.localeCompare(b));
});
const storeOpenMap = useStorage('storeOpenMap', {});

const updateStoreMap = (category, isOpen) => {
  storeOpenMap.value[category] = isOpen;
  localStorage.setItem('storeOpenMap', storeOpenMap.toString());
};

const buyItems = computed(() => {
  console.log(showBuyItemsFromAllLists);
  if (showBuyItemsFromAllLists.value) {
    return itemStore.getFilteredAllBuyItems;
  }
  return itemStore.getFilteredShoppingItems;
});
</script>
<template>
  <NuxtLayout name="app">
    <NuxtLayout name="list">
      <div
        class="h-[calc(100%_-_7rem)] w-full overflow-auto"
        :class="{ '!h-[calc(100%_-_17rem)]': !listStore.selectedList }">
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
                  buyItems
                    ?.filter((item) => item.store === category)
                    .sort((a, b) => a.id - b.id || a.name.localeCompare(b?.name))
                "></BuyList>
            </CollapsibleContent>
          </Collapsible>
        </div>
        <div v-if="categories?.length === 0 && listStore.selectedList" class="p-2">
          <CreateNewItem store="Super market">Add an item to the buy list </CreateNewItem>
        </div>
      </div>
    </NuxtLayout>
  </NuxtLayout>
</template>
