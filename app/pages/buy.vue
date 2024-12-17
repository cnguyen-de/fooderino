<script setup>
import { useItemStore } from '~/store/item';
import { ChevronRight } from 'lucide-vue-next';
import { useStorage } from '@vueuse/core';
const itemStore = useItemStore();
itemStore.fetchBuyItems();

const categories = computed(() => {
  const stores = itemStore?.purchasedItems?.map((item) => item.store.trim());
  return [...new Set(stores)].sort((a, b) => a.localeCompare(b));
});
const storeOpenMap = useStorage('storeOpenMap', {});

const updateStoreMap = (category, isOpen) => {
  storeOpenMap.value[category] = isOpen;
  localStorage.setItem('storeOpenMap', storeOpenMap.toString());
};
</script>
<template>
  <NuxtLayout name="app">
    <NuxtLayout name="list">
      <div class="h-[calc(100%_-_7rem)] w-full overflow-auto">
        <div v-for="category in categories" :key="category">
          <Collapsible :open="storeOpenMap[category]" @update:open="updateStoreMap(category, $event)">
            <div class="flex flex-row pr-4">
              <CollapsibleTrigger class="group/collapsible flex flex-row py-2">
                <h2 class="px-2 font-bold text-white">{{ category }}</h2>
                <ChevronRight
                  class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </CollapsibleTrigger>
              <CreateNewItem :store="category"></CreateNewItem>
              <span class="flex-grow"></span>
            </div>
            <CollapsibleContent>
              <BuyList
                :items="
                  itemStore?.purchasedItems
                    ?.filter((item) => item.store === category)
                    .sort((a, b) => a.id - b.id || a.name.localeCompare(b?.name))
                "></BuyList>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </NuxtLayout>
  </NuxtLayout>
</template>
