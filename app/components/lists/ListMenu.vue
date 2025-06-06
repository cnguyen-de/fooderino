<script setup lang="ts">
import { EllipsisVertical, Pencil, Trash } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import { useDrawerStore } from '~/store/drawers';
import { useInviteStore } from '~/store/invites';
import { useListStore } from '~/store/list';

const drawerStore = useDrawerStore();
const listStore = useListStore();
const inviteStore = useInviteStore();
const { selectedList } = toRefs(listStore);

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
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button class="relative h-9 border-none bg-transparent p-2" variant="ghost">
        <EllipsisVertical class="size-5"></EllipsisVertical>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuLabel> {{ selectedList.name }}</DropdownMenuLabel>
      <DropdownMenuItem><NuxtLink to="/logs">Logs</NuxtLink></DropdownMenuItem>
      <DropdownMenuSeparator />
      <div class="flex flex-row items-center gap-1 px-2 pt-2">
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
      <DropdownMenuItem>
        <InviteButton>Invite</InviteButton>
      </DropdownMenuItem>

      <DropdownMenuSeparator />
      <DropdownMenuItem>
        <button class="flex items-center justify-center gap-2" @click="drawerStore.isRenameListDrawerOpen = true">
          <Pencil class="size-5"></Pencil>
          Rename
        </button>
      </DropdownMenuItem>
      <DropdownMenuItem class="text-red-500">
        <button class="flex items-center justify-center gap-2" @click="drawerStore.isDeleteListDrawerOpen = true">
          <Trash class="size-5"></Trash>
          Delete
        </button>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
