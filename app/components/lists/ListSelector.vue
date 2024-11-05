<script lang="ts" setup>
import { useListStore } from '~/store/list';

const { selectedList, lists } = toRefs(useListStore());
</script>

<template>
  <div v-if="selectedList?.name" class="flex flex-row justify-between">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button class="mb-2 border-none bg-transparent px-2 text-2xl text-white" variant="outline">
          {{ selectedList?.name }} ▾
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent class="w-56">
        <DropdownMenuLabel>Your Lists</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup v-model="selectedList.id">
          <DropdownMenuRadioItem v-for="list of lists" :value="list.id">{{ list?.name }}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>

    <div class="mr-2 mt-1.5 flex flex-row items-center gap-1">
      <Popover v-for="user of selectedList.users">
        <PopoverTrigger>
          <Avatar class="size-8">
            <AvatarImage :src="user.avatar" alt="@radix-vue" />
            <AvatarFallback>{{
              user.name
                .split(' ')
                .map((n) => n[0])
                .join('.')
            }}</AvatarFallback>
          </Avatar>
        </PopoverTrigger>
        <PopoverContent>
          <div class="flex flex-row gap-2">
            <Avatar>
              <AvatarImage :src="user.avatar" alt="@radix-vue" />
              <AvatarFallback>{{
                user.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('.')
              }}</AvatarFallback>
            </Avatar>
            <div class="flex flex-col">
              <p>{{ user.name }}</p>
              <p class="text-sm font-thin">{{ user.email }}</p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  </div>
  <div v-else class="p-4">
    <NewList></NewList>
  </div>
</template>
