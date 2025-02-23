<script setup lang="ts">
import { useItemStore } from '~/store/item';
import type { Item } from '~~/types/Item';

const props = defineProps<{ item: Item; isBuyList: boolean }>();

const itemStore = useItemStore();
const isEditItemDrawerOpen = ref(false);
const showDeleteConfirmation = ref(false);
const locationRef = ref(props.isBuyList ? props.item.store : props.item.location);
const defaultAmountRef = ref(props.item.default_amount);
const onDeleteItem = async () => {
  await itemStore.deleteItem(props.item.id);
  isEditItemDrawerOpen.value = false;
};
const isDirty = ref(false);
const saveChanges = async () => {
  if (!isDirty.value) {
    isEditItemDrawerOpen.value = false;
    return;
  }
  let item = { ...props.item };
  if (locationRef.value !== '') {
    if (props.isBuyList) {
      item = { ...item, store: locationRef.value };
    } else {
      item = { ...item, location: locationRef.value };
    }
  }
  if (defaultAmountRef.value !== props.item.default_amount) {
    item = { ...item, default_amount: defaultAmountRef.value };
  }
  await itemStore.updateItem(item);
  isEditItemDrawerOpen.value = false;
};
</script>
<template>
  <Drawer v-model:open="isEditItemDrawerOpen" @onOpenChange="isEditItemDrawerOpen = $event">
    <DrawerTrigger class="pr-2 text-gray-600 dark:text-gray-400">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="size-6">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
      </svg>
    </DrawerTrigger>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle> {{ locationRef }} | {{ item.name }}</DrawerTitle>
      </DrawerHeader>
      <DrawerFooter @change="isDirty = true">
        <div class="flex flex-row items-center gap-4">
          <label for="defaultAmount" class="whitespace-nowrap">Default Amount</label>
          <Input id="defaultAmount" v-model="defaultAmountRef" name="defaultAmount" />
        </div>
        <div class="flex flex-row items-center gap-4">
          <label for="defaultAmount" class="whitespace-nowrap">
            {{ props.isBuyList ? 'Store' : 'Category' }}
          </label>

          <Input v-model="locationRef" placeholder="New Value" />
        </div>
        <div v-if="!showDeleteConfirmation" class="flex w-full justify-between">
          <Button variant="ghost" class="text-red-500" @click="showDeleteConfirmation = true"> Delete </Button>
          <Button @click="saveChanges()">
            Save changes
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="ml-2 size-6">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </Button>
        </div>
        <div v-else class="flex w-full flex-row justify-between">
          <Button variant="ghost" class="" @click="showDeleteConfirmation = false">No, do not delete</Button>
          <Button variant="outline" class="text-red-500" @click="onDeleteItem()">Yes, delete</Button>
        </div>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
</template>
