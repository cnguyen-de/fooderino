<script lang="ts" setup>
import { useListStore } from '~/store/list';

const { selectedList, lists } = toRefs(useListStore());
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button class="-ml-2 mb-2 border-none bg-transparent text-2xl text-white" variant="outline">
        {{ selectedList.name }} ▾
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent class="w-56">
      <DropdownMenuLabel>Your Lists</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuRadioGroup v-model="selectedList.id">
        <DropdownMenuRadioItem v-for="list of lists" :value="list.id">{{ list.name }}</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
