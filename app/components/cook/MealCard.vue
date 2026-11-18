<script setup lang="ts">
import { Check, X } from 'lucide-vue-next';
import type { Meal, MealDish } from '~/composables/useCook';
import { needsText } from '~/utils/cook-format';
defineProps<{ meal: Meal; title: string }>();
const { removeDish } = useCook();
const selected = ref<MealDish | null>(null);
const busy = ref(false);
async function remove(restock: boolean) {
  if (!selected.value || busy.value) return;
  busy.value = true;
  if (await removeDish(selected.value.id, { restock })) selected.value = null;
  busy.value = false;
}
</script>
<template>
  <section class="space-y-1.5 rounded-xl border bg-card p-3">
    <div class="flex items-baseline justify-between gap-2">
      <h2 class="text-sm font-semibold">{{ title }}</h2>
      <span v-if="needsText(meal.needs)" class="text-xs text-muted-foreground">{{ needsText(meal.needs) }}</span>
      <span v-else-if="meal.dishes.length" class="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300"
        ><Check class="size-3.5" aria-hidden="true" />Complete meal</span
      >
    </div>
    <ul v-if="meal.dishes.length" class="space-y-1">
      <li v-for="dish in meal.dishes" :key="dish.id">
        <button
          type="button"
          class="flex h-9 w-full items-center gap-2 rounded-lg bg-muted/40 px-2.5 text-left transition-colors hover:bg-muted"
          :aria-label="`${dish.recipe.name}, options`"
          @click="selected = dish">
          <span class="min-w-0 flex-1 truncate font-medium" :class="dish.recipe.deleted && 'text-muted-foreground'">{{
            dish.recipe.name
          }}</span
          ><KindBadge :kind="dish.recipe.kind" />
        </button>
      </li>
    </ul>
    <p v-else class="text-sm text-muted-foreground">Nothing cooked yet.</p>
    <Drawer :open="!!selected" @update:open="!$event && (selected = null)">
      <DrawerContent class="mx-auto max-w-xl rounded-t-2xl">
        <DrawerHeader class="flex items-start justify-between gap-3 px-5 pb-3 text-left">
          <div class="min-w-0">
            <DrawerTitle class="text-base">{{ selected?.recipe.name }}</DrawerTitle>
            <DrawerDescription class="mt-1 text-xs">{{ title }}</DrawerDescription>
          </div>
          <button
            type="button"
            aria-label="Close"
            class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
            @click="selected = null">
            <X class="size-4" />
          </button>
        </DrawerHeader>
        <div class="space-y-2 px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            v-if="selected && !selected.recipe.deleted"
            as-child
            variant="secondary"
            class="h-10 w-full"
            @click="selected = null"
            ><NuxtLink :to="`/cook/recipes/${selected.recipe.id}`">Open recipe</NuxtLink></Button
          >
          <Button
            v-if="selected?.uses.length"
            variant="secondary"
            class="h-10 w-full"
            :disabled="busy"
            @click="remove(true)"
            >Remove and put ingredients back</Button
          >
          <Button variant="destructive" class="h-10 w-full" :disabled="busy" @click="remove(false)">{{
            selected?.uses.length ? 'Remove, keep stock as is' : 'Remove from meal'
          }}</Button>
        </div>
      </DrawerContent>
    </Drawer>
  </section>
</template>
