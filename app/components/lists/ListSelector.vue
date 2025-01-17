<script lang="ts" setup>
import { useListStore } from '~/store/list';
import { useSettingsStore } from '~/store/settings';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useForm } from 'vee-validate';
import { useInviteStore } from '~/store/invites';
import UserList from '~/components/lists/UserList.vue';
import { toast } from 'vue-sonner';

const listStore = useListStore();
const { selectedList, lists } = toRefs(listStore);
const settingStore = useSettingsStore();
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
const onRemoveUser = async (email: string, isInvite = false) => {
  if (isInvite) {
    await inviteStore.removeInvite(email);
  } else {
    await listStore.removeUser(email);
  }

  toast('Successfully removed user', email);
};
</script>

<template>
  <div v-if="selectedList?.name" class="flex flex-row justify-between">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button class="relative my-2 ml-2 border-none bg-transparent px-0 text-2xl" variant="outline">
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
    <div class="ml-2 flex items-center justify-center gap-1">
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
      <FilterItemsInput></FilterItemsInput>
    </div>
    <div class="flex-grow"></div>
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
    </div>

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
  </div>
  <div v-else class="p-4">
    <NewList></NewList>
  </div>
</template>
