<script lang="ts" setup>
import { useListStore } from '~/store/list';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useForm } from 'vee-validate';
import { ScanLine, ShoppingBasket } from 'lucide-vue-next';
import { useStorage } from '@vueuse/core';
import { useItemStore } from '~/store/item';
import { useDrawerStore } from '~/store/drawers';

const listStore = useListStore();
const itemStore = useItemStore();
const drawerStore = useDrawerStore();
const { selectedList, lists, isLoading } = toRefs(listStore);
const showLoading = computed(() => lists.value.length === 0 && isLoading.value);
const formSchema = toTypedSchema(
  z.object({
    name: z.string().min(1).max(50)
  })
);
const form = useForm({
  validationSchema: formSchema
});

const isScanOpen = ref(false);
const isCreateListDrawerOpen = ref(false);
const openCreateListDrawer = () => {
  isCreateListDrawerOpen.value = true;
};
const user = useSupabaseUser();
const onSubmit = form.handleSubmit(async (values) => {
  await listStore.createList(values.name, {
    id: user.value?.id ?? null,
    email: user.value?.email ?? '',
    name: user.value?.user_metadata?.full_name ?? null,
    avatar: user.value?.user_metadata?.picture ?? null
  });
  isCreateListDrawerOpen.value = false;
});
// Radix's radio group binds string values, so this rides on the list id rather
// than the record. Binding the object never matched — the group stringifies
// what it is given, so the selected item could not be identified.
const selectedDropDownItem = computed({
  get: () => listStore.selectedList?.id ?? '',
  set: (id: string) => listStore.setSelectedList(lists.value.find((l) => l.id === id) ?? null)
});

const isShoppingMode = ref(itemStore.showBuyItemsFromAllLists);
const toggleAllLists = () => {
  isShoppingMode.value = !isShoppingMode.value;
  // No fetch: every list's items are already in Dexie, so the flag alone
  // switches which computed the pages read.
  itemStore.showBuyItemsFromAllLists = isShoppingMode.value;
};

const onDeleteListConfirm = async () => {
  if (!selectedList.value) return;
  await listStore.deleteList(selectedList.value.id);
};

const newListName = ref('');
const onRenameList = async () => {
  if (!selectedList.value) return;
  await listStore.renameList(selectedList.value.id, newListName.value);
  newListName.value = '';
};
</script>

<template>
  <div v-if="showLoading" class="flex h-20 items-center justify-center">
    <LoadingSpinner message="Loading lists..." />
  </div>

  <div v-else-if="selectedList?.name" class="flex flex-row items-center p-1">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button class="relative border-none bg-transparent p-0 px-2 text-2xl" variant="outline">
          {{ selectedList?.name }} ▾
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Your Lists</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup v-model="selectedDropDownItem">
          <DropdownMenuRadioItem v-for="list of lists" :key="list.id" :value="list.id">{{
            list.name
          }}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <button @click="openCreateListDrawer()" class="flex items-center justify-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="size-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create New List
          </button>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <button @click="isScanOpen = true" class="flex items-center justify-center gap-2">
            <ScanLine class="size-4" />
            Join With Code
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <div class="flex items-center justify-center">
      <FilterItemsInput class="mx-1"></FilterItemsInput>
    </div>
    <div class="flex-grow"></div>
    <Toggle v-if="false" class="mr-1 px-2" :pressed="isShoppingMode" @update:pressed="toggleAllLists">
      <ShoppingBasket
        :class="[isShoppingMode ? 'text-orange-700 dark:text-orange-300' : 'text-gray-600']"></ShoppingBasket>
    </Toggle>
    <NuxtLink to="/shopping" class="mx-2 flex flex-row gap-1 rounded-md border px-2 py-1 tracking-tighter">
      <ShoppingBasket class="text-orange-700 dark:text-orange-300"></ShoppingBasket>
      <span
        class="inline-block bg-gradient-to-r from-red-700 to-yellow-700 bg-clip-text text-transparent dark:from-red-400 dark:to-orange-300"
        >Shopping</span
      >
    </NuxtLink>
    <ListMenu></ListMenu>
    <ScanJoinModal v-model:open="isScanOpen" />

    <!-- Create List Drawer -->
    <Drawer v-model:open="isCreateListDrawerOpen" @onOpenChange="isCreateListDrawerOpen = $event">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add new list</DrawerTitle>
        </DrawerHeader>
        <form class="space-y-2 p-4" @submit="onSubmit">
          <FormField v-slot="{ componentField }" name="name">
            <FormItem>
              <FormControl>
                <Input type="text" placeholder="Name" v-bind="componentField" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </form>
        <DrawerFooter>
          <div class="flex flex-row justify-between">
            <DrawerClose>
              <Button class="text-red-500" variant="ghost"> Cancel </Button>
            </DrawerClose>
            <DrawerClose>
              <Button type="submit" @click.prevent="onSubmit">Submit</Button>
            </DrawerClose>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>

    <!-- Rename List Drawer -->
    <Drawer
      v-model:open="drawerStore.isRenameListDrawerOpen"
      @onOpenChange="drawerStore.isRenameListDrawerOpen = $event">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Rename {{ selectedList.name }} list</DrawerTitle>
        </DrawerHeader>
        <form class="space-y-2 p-4" @submit.prevent="onRenameList">
          <FormField name="list-rename">
            <FormItem>
              <FormControl>
                <Input type="text" name="list-rename" :placeholder="selectedList.name" v-model="newListName" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </form>
        <DrawerFooter>
          <div class="flex flex-row justify-between">
            <DrawerClose>
              <Button class="text-red-500" variant="ghost" @click="drawerStore.isRenameListDrawerOpen = false">
                Cancel
              </Button>
            </DrawerClose>
            <DrawerClose>
              <Button type="submit" @click.prevent="onRenameList">Accept</Button>
            </DrawerClose>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>

    <!-- Delete List Drawer -->
    <Drawer
      v-model:open="drawerStore.isDeleteListDrawerOpen"
      @onOpenChange="drawerStore.isDeleteListDrawerOpen = $event">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle
            ><span class="font-bold">{{ selectedList.name }}</span> list will be deleted</DrawerTitle
          >
          <DrawerDescription> All items in the list will also be deleted. Are you sure? </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <div class="flex flex-row justify-between">
            <DrawerClose>
              <Button class="text-red-500" variant="ghost" @click="drawerStore.isDeleteListDrawerOpen = false">
                Cancel
              </Button>
            </DrawerClose>
            <DrawerClose>
              <Button type="submit" @click.prevent="onDeleteListConfirm">Yes</Button>
            </DrawerClose>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  </div>

  <div v-else class="p-4">
    <NewList></NewList>
  </div>
</template>
