<script setup lang="ts">
import { EllipsisVertical, Pencil, QrCode, Trash } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import { useDrawerStore } from '~/store/drawers';
import { useListStore } from '~/store/list';

const drawerStore = useDrawerStore();
const listStore = useListStore();
const { selectedList } = toRefs(listStore);

const onRemoveUser = async (listId: string, email: string) => {
  try {
    await listStore.removeUser(listId, email);
  } catch (e) {
    toast('Could not remove user', { description: (e as Error).message });
    return;
  }
  toast('Successfully removed user', { description: email });
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
      <DropdownMenuLabel> {{ selectedList?.name }}</DropdownMenuLabel>
      <DropdownMenuItem><NuxtLink to="/logs">Logs</NuxtLink></DropdownMenuItem>
      <DropdownMenuSeparator />
      <div v-if="selectedList" class="flex flex-row items-center gap-1 px-2 pt-2">
        <UserList
          class="size-8"
          v-for="member of listStore.selectedMembers"
          :avatar="member.avatar ?? ''"
          :name="member.name ?? undefined"
          :email="member.email"
          :admin="member.role === 'admin'"
          :key="member.email"
          @remove-user="onRemoveUser(selectedList.id, $event)">
        </UserList>
      </div>
      <DropdownMenuItem>
        <button class="flex items-center justify-center gap-2" @click="drawerStore.isShareListDrawerOpen = true">
          <QrCode class="size-5"></QrCode>
          Share
        </button>
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
  <ShareListModal v-model:open="drawerStore.isShareListDrawerOpen" :list-id="selectedList?.id ?? null" />
</template>
