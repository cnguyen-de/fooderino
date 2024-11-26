<script setup>
import { useItemStore } from '~/store/item';
import { useSettingsStore } from '~/store/settings';
import { ChevronRight } from 'lucide-vue-next';
const itemStore = useItemStore();
const settingStore = useSettingsStore();
onMounted(() => {
  itemStore.fetchInventoryItems();
});
const categories = computed(() => {
  const cat = itemStore.getFilteredInventoryItems?.map((item) => item.location.trim());
  return [...new Set(cat)].sort((a, b) => a.localeCompare(b));
});
const items = computed(() => {
  let items = itemStore.getFilteredInventoryItems;
  if (!settingStore.settings?.show_empty_items) {
    items = items.filter((item) => item.amount > 0);
  }
  return items;
});
</script>
<template>
  <NuxtLayout name="app">
    <NuxtLayout name="list">
      <div class="h-[calc(100%_-_7rem)] w-full overflow-auto">
        <div v-for="category in categories" :key="category">
          <Collapsible default-open>
            <CollapsibleTrigger class="group/collapsible py-2">
              <div class="flex flex-row">
                <h2 class="pl-4 font-bold text-white">{{ category }}</h2>
                <ChevronRight
                  class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <InventoryList
                :items="
                  items
                    ?.filter((item) => item.location === category)
                    .sort((a, b) => a.id - b.id || a.name.localeCompare(b?.name))
                "></InventoryList>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </NuxtLayout>
  </NuxtLayout>
</template>
