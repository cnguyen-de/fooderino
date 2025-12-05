<script lang="ts" setup>
import { useListStore } from '~/store/list';
import { useSettingsStore } from '~/store/settings';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useForm } from 'vee-validate';
import { useInviteStore } from '~/store/invites';
import { toast } from 'vue-sonner';
import { ShoppingBasket } from 'lucide-vue-next';
import { useStorage } from '@vueuse/core';
import { useItemStore } from '~/store/item';
import { useDrawerStore } from '~/store/drawers';

const listStore = useListStore();
const itemStore = useItemStore();
const settingStore = useSettingsStore();
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

const isCreateListDrawerOpen = ref(false);
const openCreateListDrawer = () => {
  isCreateListDrawerOpen.value = true;
};
const onSubmit = form.handleSubmit(async (values) => {
  await useListStore().createList(values.name);
  isCreateListDrawerOpen.value = false;
});
const selectedDropDownItem = ref(listStore.selectedList);
watch(selectedDropDownItem, (value) => {
  listStore.setSelectedList(value);
});

const inviteStore = useInviteStore();
const isAcceptInviteDrawerOpen = ref(false);
const openAcceptInviteDrawer = (invite) => {
  isAcceptInviteDrawerOpen.value = true;
  inviteStore.setSelectedInvite(invite);
};
const acceptInvite = async (accept) => {
  await inviteStore.acceptInvite(accept);
  inviteStore.setSelectedInvite(null);
  toast('Successfully joined list');
  isAcceptInviteDrawerOpen.value = false;
};

const isShoppingMode = ref(itemStore.showBuyItemsFromAllLists);
const toggleAllLists = async () => {
  isShoppingMode.value = !isShoppingMode.value;
  itemStore.showBuyItemsFromAllLists = isShoppingMode.value;
  if (isShoppingMode.value) {
    await itemStore.fetchBuyItemsFromAllLists();
  }
};

const inviteEmail = ref('');
const onSubmitInvite = async () => {
  await inviteStore.sendInvite(inviteEmail.value, selectedList.value.id);
  drawerStore.isInviteDrawerOpen = false;
  inviteEmail.value = '';
};

const onDeleteListConfirm = async () => {
  await listStore.deleteList(selectedList.value.id);
};

const newListName = ref('');
const onRenameList = async () => {
  await listStore.renameList(newListName.value);
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
          <span
            v-if="inviteStore.receivedInvites?.length > 0"
            class="absolute right-0 top-1 size-2 animate-pulse rounded-full bg-primary"></span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Your Lists</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup v-model="selectedDropDownItem">
          <DropdownMenuRadioItem v-for="list of lists" :value="list">{{ list?.name }}</DropdownMenuRadioItem>
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
        <div v-if="inviteStore.receivedInvites?.length > 0">
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Invitations</DropdownMenuLabel>
          <DropdownMenuItem
            v-for="invite of inviteStore.receivedInvites"
            :key="invite.id"
            class="whitespace-nowrap"
            @click="openAcceptInviteDrawer(invite)">
            From {{ invite.from }}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
    <div class="flex items-center justify-center">
      <button v-if="false" variant="ghost" @click="settingStore.toggleEmptyItems()">
        <svg
          v-if="settingStore.settings?.show_empty_items"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="size-6">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="size-6">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
        </svg>
      </button>
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
    <!-- 
    <div class="mx-2 flex flex-row items-center justify-center gap-1">
      <InviteButton></InviteButton>
      <UserList
        v-if="
          inviteStore.sentInvites?.length > 0 &&
          inviteStore.sentInvites?.some((invite) => invite.list_id === selectedList?.id)
        "
        v-for="invitedUser of inviteStore.sentInvites"
        :email="invitedUser.to"
        @remove-user="onRemoveUser($event, true)"></UserList>
      <UserList
        class="size-8"
        v-for="user of selectedList?.users"
        :avatar="user.avatar"
        :name="user.name"
        :email="user.email"
        :admin="user?.admin ?? false"
        :key="user.email"
        @remove-user="onRemoveUser($event)">
      </UserList>
    </div> -->

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

    <!-- Accept Invite Drawer -->
    <Drawer v-model:open="isAcceptInviteDrawerOpen" @onOpenChange="isAcceptInviteDrawerOpen = $event">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>List Invitation</DrawerTitle>
          <DrawerDescription
            >{{ inviteStore.selectedInvite?.from }} has invited you to join their list. Do you accept the
            invitation?</DrawerDescription
          >
        </DrawerHeader>
        <DrawerFooter>
          <div class="flex flex-row justify-between">
            <DrawerClose>
              <Button class="text-red-500" variant="ghost" @click="acceptInvite(false)">Deny</Button>
            </DrawerClose>
            <DrawerClose>
              <Button type="submit" @click.prevent="acceptInvite(true)">Accept</Button>
            </DrawerClose>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>

    <!-- Invite Drawer -->
    <Drawer v-model:open="drawerStore.isInviteDrawerOpen" @onOpenChange="drawerStore.isInviteDrawerOpen = $event">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Invite someone to join the {{ selectedList?.name }} list</DrawerTitle>
          <DrawerDescription>The invited person will be able to see and edit the list</DrawerDescription>
        </DrawerHeader>
        <form class="space-y-2 p-4" @submit="onSubmitInvite">
          <FormField name="invite-email">
            <FormItem>
              <FormControl>
                <Input type="text" name="invite-email" placeholder="Email" v-model="inviteEmail" />
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
              <Button type="submit" @click.prevent="onSubmitInvite">Submit</Button>
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
        <form class="space-y-2 p-4" @submit="onSubmitInvite">
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
