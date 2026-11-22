<script setup lang="ts">
import { Check, Plus, X } from 'lucide-vue-next';
import type { Meal, MealDish, MealIngredient } from '~/composables/useCook';
import type { RecipeId } from '~~/types/cook';
import { needsText, qtyText } from '~/utils/cook-format';
const props = defineProps<{ meal: Meal; title: string }>();
const cook = useCook();

type Entry = { kind: 'dish'; dish: MealDish } | { kind: 'ingredient'; used: MealIngredient };
const selected = ref<Entry | null>(null);
const busy = ref(false);
const entryName = (entry: Entry) => (entry.kind === 'dish' ? entry.dish.recipe.name : entry.used.ingredient.name);
const entryUses = (entry: Entry) => (entry.kind === 'dish' ? entry.dish.uses : entry.used.uses);
async function remove(restock: boolean) {
  const entry = selected.value;
  if (!entry || busy.value) return;
  busy.value = true;
  const done =
    entry.kind === 'dish'
      ? await cook.removeDish(entry.dish.id, { restock })
      : await cook.removeIngredient(entry.used.id, { restock });
  if (done) selected.value = null;
  busy.value = false;
}

const picking = ref(false);
const cooking = ref<RecipeId | null>(null);
const cookOpen = computed({
  get: () => cooking.value !== null,
  set: (value) => {
    if (!value) cooking.value = null;
  }
});
function cookRecipe(id: RecipeId) {
  picking.value = false;
  cooking.value = id;
}
const adding = ref(false);
const changing = ref<MealIngredient | null>(null);
const sheetOpen = computed({
  get: () => adding.value || changing.value !== null,
  set: (value) => {
    if (value) return;
    adding.value = false;
    changing.value = null;
  }
});
function changeAmount(used: MealIngredient) {
  selected.value = null;
  changing.value = used;
}
const empty = computed(() => !props.meal.dishes.length && !props.meal.ingredients.length);
</script>
<template>
  <section class="space-y-1.5 rounded-xl border bg-card p-3">
    <div class="flex items-baseline justify-between gap-2">
      <h2 class="text-sm font-semibold">{{ title }}</h2>
      <span v-if="needsText(meal.needs)" class="text-xs text-muted-foreground">{{ needsText(meal.needs) }}</span>
      <span
        v-else-if="meal.dishes.length"
        class="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300"
        ><Check class="size-3.5" aria-hidden="true" />Complete meal</span
      >
    </div>
    <ul v-if="!empty" class="space-y-1">
      <li v-for="dish in meal.dishes" :key="dish.id">
        <button
          type="button"
          class="flex h-9 w-full items-center gap-2 rounded-lg bg-muted/40 px-2.5 text-left transition-colors hover:bg-muted"
          :aria-label="`${dish.recipe.name}, options`"
          @click="selected = { kind: 'dish', dish }">
          <span class="min-w-0 flex-1 truncate font-medium" :class="dish.recipe.deleted && 'text-muted-foreground'">{{
            dish.recipe.name
          }}</span
          ><KindBadge :kind="dish.recipe.kind" />
        </button>
      </li>
      <li v-for="used in meal.ingredients" :key="used.id">
        <button
          type="button"
          class="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm transition-colors hover:bg-muted"
          :aria-label="`${used.ingredient.name}, options`"
          @click="selected = { kind: 'ingredient', used }">
          <span class="min-w-0 flex-1 truncate">{{ used.ingredient.name }}</span
          ><span class="shrink-0 text-xs tabular-nums text-muted-foreground">{{ qtyText(used.ingredient.qty) }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="text-sm text-muted-foreground">Nothing cooked yet.</p>
    <div class="flex gap-1">
      <Button type="button" variant="ghost" size="xs" class="gap-1 text-xs text-primary" @click="picking = true"
        ><Plus class="size-3.5" />Add dish</Button
      ><Button type="button" variant="ghost" size="xs" class="gap-1 text-xs text-primary" @click="adding = true"
        ><Plus class="size-3.5" />Add ingredient</Button
      >
    </div>
    <Drawer :open="!!selected" @update:open="!$event && (selected = null)">
      <DrawerContent class="mx-auto max-w-xl rounded-t-2xl">
        <DrawerHeader class="flex items-start justify-between gap-3 px-5 pb-3 text-left">
          <div class="min-w-0">
            <DrawerTitle class="text-base">{{ selected && entryName(selected) }}</DrawerTitle>
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
            v-if="selected?.kind === 'dish' && !selected.dish.recipe.deleted"
            as-child
            variant="secondary"
            class="h-10 w-full"
            @click="selected = null"
            ><NuxtLink :to="`/cook/recipes/${selected.dish.recipe.id}`">Open recipe</NuxtLink></Button
          >
          <Button
            v-if="selected?.kind === 'ingredient'"
            variant="secondary"
            class="h-10 w-full"
            :disabled="busy"
            @click="changeAmount(selected.used)"
            >Change amount</Button
          >
          <Button
            v-if="selected && entryUses(selected).length"
            variant="secondary"
            class="h-10 w-full"
            :disabled="busy"
            @click="remove(true)"
            >{{ selected.kind === 'dish' ? 'Remove and put ingredients back' : 'Remove and put it back' }}</Button
          >
          <Button variant="destructive" class="h-10 w-full" :disabled="busy" @click="remove(false)">{{
            selected && entryUses(selected).length ? 'Remove, keep stock as is' : 'Remove from meal'
          }}</Button>
        </div>
      </DrawerContent>
    </Drawer>
    <Drawer v-model:open="picking">
      <DrawerContent class="mx-auto max-h-[90dvh] max-w-xl rounded-t-2xl">
        <DrawerHeader class="flex items-start justify-between gap-3 px-5 pb-3 text-left">
          <div class="min-w-0">
            <DrawerTitle class="text-base">Add a dish</DrawerTitle>
            <DrawerDescription class="mt-1 text-xs">{{ title }}</DrawerDescription>
          </div>
          <button
            type="button"
            aria-label="Close"
            class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
            @click="picking = false">
            <X class="size-4" />
          </button>
        </DrawerHeader>
        <div class="px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <RecipePicker @pick="cookRecipe" />
        </div>
      </DrawerContent>
    </Drawer>
    <CookSheet v-model:open="cookOpen" :recipe="cooking ? cook.recipe(cooking) : undefined" :initial-date="meal.date" />
    <IngredientSheet v-model:open="sheetOpen" :date="meal.date" :title="title" :entry="changing ?? undefined" />
  </section>
</template>
