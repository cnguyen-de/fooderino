<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next';
import ItemCombobox from '~/components/pantry/ItemCombobox.vue';
import type { Ingredient, RecipeKind, RecipeView } from '~/composables/useCook';
import type { ItemId, PantryItem, Unit } from '~~/types/pantry';
const props = defineProps<{ recipe?: RecipeView }>();
const cook = useCook();
const router = useRouter();

interface Row {
  key: number;
  name: string;
  item_id: ItemId | null;
  amount: string;
  unit: Unit;
}
let nextKey = 0;
const row = (i?: Ingredient): Row => ({
  key: nextKey++,
  name: i?.name ?? '',
  item_id: i?.item_id ?? null,
  amount: i?.qty ? String(i.qty.amount) : '',
  unit: i?.qty?.unit ?? 'count'
});

const name = ref(props.recipe?.name ?? '');
const kind = ref<RecipeKind>(props.recipe?.kind ?? 'dish');
const rows = ref<Row[]>([...(props.recipe?.ingredients ?? []).map(row), row()]);
const instructions = ref(props.recipe?.instructions ?? '');
const busy = ref(false);

function rename(r: Row, value: string) {
  if (value !== r.name) r.item_id = null;
  r.name = value;
}
function pick(r: Row, item: PantryItem) {
  r.name = item.name;
  r.item_id = item.id;
  r.unit = item.unit;
}
function addRow() {
  rows.value.push(row());
}
function removeRow(r: Row) {
  rows.value = rows.value.filter((x) => x !== r);
  if (!rows.value.length) addRow();
}

async function save() {
  if (busy.value) return;
  busy.value = true;
  const ingredients: Ingredient[] = rows.value.map((r) => ({
    name: r.name,
    item_id: r.item_id,
    qty: r.amount === '' ? null : { amount: Number(r.amount), unit: r.unit }
  }));
  const id = await cook.saveRecipe({
    id: props.recipe?.id,
    name: name.value,
    kind: kind.value,
    ingredients,
    instructions: instructions.value
  });
  busy.value = false;
  if (id) await router.replace(`/cook/recipes/${id}`);
}
</script>
<template>
  <form class="space-y-4" @submit.prevent="save">
    <label class="block">
      <span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Name</span>
      <Input
        v-model="name"
        required
        placeholder="Canh chua"
        class="mt-1 h-10 rounded-lg border-0 bg-muted/50 text-base font-semibold shadow-none" />
    </label>
    <div role="radiogroup" aria-label="Kind" class="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5">
      <button
        v-for="option in [
          { value: 'dish', label: 'Dish' },
          { value: 'soup', label: 'Soup' }
        ] as const"
        :key="option.value"
        type="button"
        role="radio"
        :aria-checked="kind === option.value"
        class="rounded-md py-1.5 text-sm font-medium transition-colors"
        :class="kind === option.value ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'"
        @click="kind = option.value">
        {{ option.label }}
      </button>
    </div>
    <section class="space-y-2 rounded-xl bg-muted/40 p-3">
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ingredients</h3>
      <div v-for="(r, index) in rows" :key="r.key" class="flex items-center gap-1.5">
        <ItemCombobox
          :model-value="r.name"
          :linked="!!r.item_id"
          :label="`Ingredient ${index + 1}`"
          @update:model-value="rename(r, $event)"
          @pick="pick(r, $event)"
          @typed="r.item_id = null" />
        <Input
          v-model="r.amount"
          type="number"
          min="0"
          step="any"
          placeholder="Qty"
          :aria-label="`Amount of ingredient ${index + 1}`"
          class="h-9 w-16 shrink-0 rounded-lg bg-background px-2 text-base tabular-nums" />
        <select
          v-model="r.unit"
          :aria-label="`Unit of ingredient ${index + 1}`"
          class="h-9 shrink-0 rounded-lg border bg-background px-1.5 text-sm">
          <option value="count">pcs</option>
          <option value="gram">g</option>
        </select>
        <button
          type="button"
          :aria-label="`Remove ingredient ${index + 1}`"
          class="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          @click="removeRow(r)">
          <X class="size-4" />
        </button>
      </div>
      <Button type="button" variant="ghost" size="xs" class="gap-1 text-xs text-primary" @click="addRow"
        ><Plus class="size-3.5" />Add ingredient</Button
      >
      <p class="text-xs text-muted-foreground">
        Pick an item from home to link it, or type a name for something you do not track.
      </p>
    </section>
    <label class="block">
      <span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Instructions</span>
      <Textarea
        v-model="instructions"
        rows="8"
        placeholder="Steps, in Markdown"
        class="mt-1 rounded-lg bg-muted/50 text-base" />
    </label>
    <div class="flex gap-2">
      <Button type="button" variant="ghost" class="h-10" @click="router.back()">Cancel</Button>
      <Button type="submit" class="h-10 flex-1 rounded-lg" :disabled="busy">{{
        busy ? 'Saving…' : 'Save recipe'
      }}</Button>
    </div>
  </form>
</template>
