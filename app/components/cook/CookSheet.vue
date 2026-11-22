<script setup lang="ts">
import { X } from 'lucide-vue-next';
import type { CookLine, RecipeView } from '~/composables/useCook';
import type { ItemId, LocalDate } from '~~/types/pantry';
import FractionChips from '~/components/cook/FractionChips.vue';
import { formatAmount, parseAmount } from '~~/utils/pantry';
const props = defineProps<{ recipe: RecipeView | undefined; initialDate?: LocalDate }>();
const open = defineModel<boolean>('open', { required: true });
const cook = useCook();
const { view, today } = usePantry();
const lines = ref<CookLine[]>([]);
const date = ref<LocalDate>(today.value);
const busy = ref(false);
/** The line whose amount was last focused; it shows the fraction chips. */
const active = ref<number | null>(null);
watch(open, (value) => {
  if (!value || !props.recipe) return;
  lines.value = cook.plan(props.recipe.id);
  date.value = props.initialDate ?? today.value;
  active.value = null;
});
const itemFor = (line: CookLine) => (line.item_id ? view.value.byId(line.item_id) : undefined);
const choices = (line: CookLine) => (line.status.match.kind === 'several' ? line.status.match.choices : []);
function choose(index: number, id: string) {
  lines.value[index] = cook.choose(lines.value[index]!, (id || null) as ItemId | null);
}
function unitHint(line: CookLine): string {
  const qty = line.status.ingredient.qty;
  const item = itemFor(line);
  if (!qty || !item || qty.unit === item.unit) return '';
  return `Recipe says ${formatAmount(qty.amount, qty.unit)}${qty.unit === 'count' ? ' pcs' : ''}. Enter how many ${item.unit === 'gram' ? 'grams' : 'pieces'} you used.`;
}
const selected = computed(() => lines.value.filter((line) => line.include && line.item_id).length);
const check = computed(() => cook.check(lines.value));
const validDate = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(date.value) && date.value <= today.value);
async function confirm() {
  if (busy.value || !props.recipe || !check.value.ok || !validDate.value) return;
  busy.value = true;
  const done = await cook.addToMeal(props.recipe.id, date.value, lines.value);
  busy.value = false;
  if (done) open.value = false;
}
</script>
<template>
  <Drawer v-model:open="open">
    <DrawerContent class="mx-auto max-h-[90dvh] max-w-xl rounded-t-2xl">
      <DrawerHeader class="flex items-start justify-between gap-3 px-5 pb-3 text-left">
        <div class="min-w-0">
          <DrawerTitle class="text-base">Cook {{ recipe?.name }}</DrawerTitle
          ><DrawerDescription class="mt-1 text-xs"
            >Check what you used. Only checked ingredients are taken from home.</DrawerDescription
          >
        </div>
        <button
          type="button"
          aria-label="Close"
          class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
          @click="open = false">
          <X class="size-4" />
        </button>
      </DrawerHeader>
      <form class="flex min-h-0 flex-1 flex-col" @submit.prevent="confirm">
        <div class="min-h-0 space-y-2 overflow-y-auto px-5 pb-4">
          <label class="flex items-center justify-between gap-3 rounded-xl bg-muted/40 p-3 text-sm font-medium"
            >Meal on<Input
              v-model="date"
              type="date"
              :max="today"
              required
              aria-label="Meal date"
              class="h-9 w-40 rounded-lg bg-background text-base"
          /></label>
          <div v-for="(line, index) in lines" :key="index" class="rounded-xl bg-muted/40 p-3">
            <div class="flex items-center gap-2.5">
              <input
                v-model="line.include"
                type="checkbox"
                class="size-4 shrink-0 accent-primary"
                :aria-label="`Use ${line.status.ingredient.name}`"
                :disabled="!itemFor(line) || itemFor(line)!.amount <= 0" />
              <label :for="`cook-qty-${index}`" class="min-w-0 flex-1 truncate text-sm font-medium">{{
                line.status.ingredient.name
              }}</label>
              <Input
                :id="`cook-qty-${index}`"
                v-model="line.qty"
                :aria-label="`Quantity of ${line.status.ingredient.name}`"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                :aria-invalid="line.include && parseAmount(line.qty) === null"
                :disabled="!line.include"
                class="h-9 w-20 shrink-0 rounded-lg bg-background text-base tabular-nums aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive"
                @focus="active = index" />
            </div>
            <FractionChips
              v-if="active === index && line.include && itemFor(line)?.unit === 'count'"
              :label="`Fractions of ${line.status.ingredient.name}`"
              class="mt-2 justify-end"
              @pick="line.qty = $event" />
            <select
              v-if="choices(line).length"
              :value="line.item_id ?? ''"
              :aria-label="`Which item is ${line.status.ingredient.name}`"
              class="mt-2 h-9 w-full rounded-lg border bg-background px-2 text-sm"
              @change="choose(index, ($event.target as HTMLSelectElement).value)">
              <option value="">Choose the item to use…</option>
              <option v-for="choice in choices(line)" :key="choice.id" :value="choice.id">
                {{ choice.name }} · {{ formatAmount(view.byId(choice.id)?.amount ?? 0, choice.unit) }} at home
              </option>
            </select>
            <p class="mt-1.5 pl-6 text-xs text-muted-foreground">
              <template v-if="itemFor(line)"
                >{{ itemFor(line)!.name }} ·
                {{
                  itemFor(line)!.amount > 0
                    ? `${formatAmount(itemFor(line)!.amount, itemFor(line)!.unit)} at home`
                    : 'none at home'
                }}</template
              ><template v-else-if="choices(line).length">Choose a match, or leave it unchecked.</template
              ><template v-else>Not tracked at home, nothing to take.</template>
            </p>
            <p v-if="unitHint(line)" class="mt-1 pl-6 text-xs text-primary">{{ unitHint(line) }}</p>
          </div>
        </div>
        <footer
          class="shrink-0 space-y-2 border-t bg-background px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p v-if="!check.ok" role="alert" class="text-xs text-destructive">{{ check.problem }}</p>
          <p v-else-if="!validDate" role="alert" class="text-xs text-destructive">Pick today or an earlier day.</p>
          <p v-else class="text-xs text-muted-foreground">
            {{ selected }} ingredient{{ selected === 1 ? '' : 's' }} checked. You can undo this afterwards.
          </p>
          <div class="flex gap-2">
            <Button type="button" variant="ghost" class="h-10" @click="open = false">Cancel</Button
            ><Button type="submit" class="h-10 flex-1 rounded-lg" :disabled="busy || !check.ok || !validDate">{{
              busy ? 'Adding…' : selected ? 'Use ingredients' : 'Add without using anything'
            }}</Button>
          </div>
        </footer>
      </form>
    </DrawerContent>
  </Drawer>
</template>
