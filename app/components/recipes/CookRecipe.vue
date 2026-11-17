<script setup lang="ts">
import { ChefHat, X } from 'lucide-vue-next';
import type { RecipeRecord } from '~~/types/sync';
import type { ItemId } from '~~/types/pantry';
import { cookingQuantity, planRecipeCooking, type CookingLine } from '~~/utils/recipe-cooking';
const props = defineProps<{ recipe: RecipeRecord }>();
const { view, search, ops } = usePantry();
const act = usePantryAction();
const open = ref(false);
const busy = ref(false);
const lines = ref<CookingLine[]>([]);
watch(open, (value) => {
  if (value) lines.value = planRecipeCooking(props.recipe.ingredients, search);
});
const itemFor = (line: CookingLine) => (line.itemId ? view.value.byId(line.itemId) : undefined);
function choose(line: CookingLine) {
  const item = itemFor(line);
  line.included = !!item && item.amount > 0;
  line.qty = cookingQuantity(line.ingredient, item);
}
const selected = computed(() => lines.value.filter((line) => line.included && line.itemId));
const problem = computed(() => {
  const totals = new Map<ItemId, number>();
  for (const line of selected.value) {
    const qty = Number(line.qty);
    if (!Number.isFinite(qty) || qty <= 0) return 'Enter a quantity greater than zero, or uncheck the ingredient.';
    const item = itemFor(line);
    if (!item) return 'An ingredient is no longer at home. Uncheck it or reopen this recipe.';
    const total = (totals.get(item.id) ?? 0) + qty;
    if (total > item.amount)
      return `Only ${item.amount}${item.unit === 'gram' ? ' g' : ''} ${item.name} at home. Reduce the quantity or uncheck it.`;
    totals.set(item.id, total);
  }
  return '';
});
async function cook() {
  if (busy.value || problem.value || !selected.value.length) return;
  busy.value = true;
  try {
    const handle = await act(
      () => ops.useItems(selected.value.map((line) => ({ id: line.itemId as ItemId, qty: Number(line.qty) }))),
      `Cooked ${props.recipe.name}`
    );
    if (handle) open.value = false;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <Button type="button" class="h-9 w-full gap-2 rounded-lg" :disabled="!recipe.ingredients.length" @click="open = true"
    ><ChefHat class="size-4" aria-hidden="true" />Cook this recipe</Button
  >
  <Drawer v-model:open="open">
    <DrawerContent class="mx-auto max-h-[90dvh] max-w-xl rounded-t-2xl">
      <DrawerHeader class="flex items-start justify-between gap-3 px-5 pb-3 text-left">
        <div class="min-w-0">
          <DrawerTitle class="text-base">Cook {{ recipe.name }}</DrawerTitle
          ><DrawerDescription class="mt-1 text-xs"
            >Check what you used. Only selected ingredients are deducted from home.</DrawerDescription
          >
        </div>
        <button
          type="button"
          aria-label="Close cooking preview"
          class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
          @click="open = false">
          <X class="size-4" />
        </button>
      </DrawerHeader>
      <form class="flex min-h-0 flex-1 flex-col" @submit.prevent="cook">
        <div class="min-h-0 space-y-2 overflow-y-auto px-5 pb-4">
          <div v-for="(line, index) in lines" :key="index" class="rounded-xl bg-muted/40 p-3">
            <div class="flex items-center gap-2.5">
              <input
                v-model="line.included"
                type="checkbox"
                class="size-4 shrink-0 accent-primary"
                :aria-label="`Use ${line.ingredient.name}`"
                :disabled="!itemFor(line)" />
              <label :for="`cook-qty-${recipe.id}-${index}`" class="min-w-0 flex-1 truncate text-sm font-medium">{{
                line.ingredient.name
              }}</label>
              <Input
                :id="`cook-qty-${recipe.id}-${index}`"
                v-model="line.qty"
                :aria-label="`Quantity of ${line.ingredient.name}`"
                type="number"
                min="0.001"
                step="any"
                :required="line.included"
                :disabled="!line.included"
                class="h-9 w-20 shrink-0 rounded-lg bg-background text-base tabular-nums" />
            </div>
            <select
              v-if="line.choices.length > 1"
              v-model="line.itemId"
              :aria-label="`Match ${line.ingredient.name}`"
              class="mt-2 h-9 w-full rounded-lg border bg-background px-2 text-sm"
              @change="choose(line)">
              <option value="">Choose the item to use…</option>
              <option v-for="choice in line.choices" :key="choice.id" :value="choice.id">
                {{ choice.name }} · {{ view.byId(choice.id)?.amount ?? 0 }} at home
              </option>
            </select>
            <p class="mt-1.5 pl-6 text-xs text-muted-foreground">
              <template v-if="itemFor(line)"
                >{{ itemFor(line)!.name }} · {{ itemFor(line)!.amount
                }}{{ itemFor(line)!.unit === 'gram' ? ' g' : '' }} at home</template
              ><template v-else-if="line.choices.length > 1"
                >Choose a match, or leave this ingredient unchecked.</template
              ><template v-else>No matching item at home — skipped.</template>
            </p>
            <p
              v-if="itemFor(line) && line.ingredient.amount_type !== itemFor(line)!.unit"
              class="mt-1 pl-6 text-xs text-primary">
              Recipe: {{ line.ingredient.amount ?? '—' }} {{ line.ingredient.amount_type === 'gram' ? 'g' : 'count' }}.
              Enter how many {{ itemFor(line)!.unit === 'count' ? 'items' : 'grams' }} you used.
            </p>
          </div>
        </div>
        <footer
          class="shrink-0 space-y-2 border-t bg-background px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p v-if="problem" role="alert" class="text-xs text-destructive">{{ problem }}</p>
          <p v-else class="text-xs text-muted-foreground">
            {{ selected.length }} ingredient{{ selected.length === 1 ? '' : 's' }} selected. You can undo this after
            cooking.
          </p>
          <div class="flex gap-2">
            <Button type="button" variant="ghost" class="h-10" @click="open = false">Cancel</Button
            ><Button type="submit" class="h-10 flex-1 rounded-lg" :disabled="busy || !!problem || !selected.length">{{
              busy ? 'Updating…' : 'Use ingredients'
            }}</Button>
          </div>
        </footer>
      </form>
    </DrawerContent>
  </Drawer>
</template>
