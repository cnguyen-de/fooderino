<script setup lang="ts">
import { X } from 'lucide-vue-next';
import ItemCombobox from '~/components/pantry/ItemCombobox.vue';
import FractionChips from '~/components/cook/FractionChips.vue';
import type { IngredientDraft } from '~/composables/useCook';
import type { LocalDate, PantryItem } from '~~/types/pantry';
import { formatAmount, parseAmount } from '~~/utils/pantry';
const props = defineProps<{ date: LocalDate; title: string }>();
const open = defineModel<boolean>('open', { required: true });
const cook = useCook();
const { view, today } = usePantry();
const blank = (): IngredientDraft => ({ name: '', item_id: null, amount: '', unit: 'count' });
const draft = ref<IngredientDraft>(blank());
const busy = ref(false);
const chips = ref(false);
watch(open, (value) => {
  if (!value) return;
  draft.value = blank();
  chips.value = false;
});
const item = computed(() => (draft.value.item_id ? view.value.byId(draft.value.item_id) : undefined));
const unit = computed(() => item.value?.unit ?? draft.value.unit);
function rename(value: string) {
  if (value !== draft.value.name) draft.value.item_id = null;
  draft.value.name = value;
}
function pick(picked: PantryItem) {
  draft.value.name = picked.name;
  draft.value.item_id = picked.id;
}
const named = computed(() => draft.value.name.trim() !== '');
const check = computed(() => cook.checkIngredient(draft.value));
const unreadable = computed(() => draft.value.amount.trim() !== '' && parseAmount(draft.value.amount) === null);
const validDate = computed(() => props.date <= today.value);
async function confirm() {
  if (busy.value || !check.value.ok || !validDate.value) return;
  busy.value = true;
  const done = await cook.addIngredient(props.date, draft.value);
  busy.value = false;
  if (done) open.value = false;
}
</script>
<template>
  <Drawer v-model:open="open">
    <DrawerContent class="mx-auto max-h-[90dvh] max-w-xl rounded-t-2xl">
      <DrawerHeader class="flex items-start justify-between gap-3 px-5 pb-3 text-left">
        <div class="min-w-0">
          <DrawerTitle class="text-base">Add an ingredient</DrawerTitle
          ><DrawerDescription class="mt-1 text-xs"
            >{{ title }}. Leave the amount blank or 0 for a pinch, such as salt.</DrawerDescription
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
        <div class="space-y-2 px-5 pb-4">
          <div class="rounded-xl bg-muted/40 p-3">
            <div class="flex items-center gap-1.5">
              <ItemCombobox
                :model-value="draft.name"
                :linked="!!draft.item_id"
                label="Ingredient"
                @update:model-value="rename"
                @pick="pick"
                @typed="draft.item_id = null" />
              <Input
                v-model="draft.amount"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                placeholder="Qty"
                aria-label="Amount used"
                :aria-invalid="unreadable"
                class="h-9 w-16 shrink-0 rounded-lg bg-background px-2 text-base tabular-nums aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive"
                @focus="chips = true" />
              <span v-if="item" class="w-10 shrink-0 text-sm text-muted-foreground">{{
                item.unit === 'gram' ? 'g' : 'pcs'
              }}</span>
              <select
                v-else
                v-model="draft.unit"
                aria-label="Unit"
                class="h-9 shrink-0 rounded-lg border bg-background px-1.5 text-sm">
                <option value="count">pcs</option>
                <option value="gram">g</option>
              </select>
            </div>
            <FractionChips
              v-if="chips && unit === 'count'"
              label="Fractions of the amount"
              class="mt-2 justify-end"
              @pick="draft.amount = $event" />
            <p class="mt-1.5 text-xs text-muted-foreground">
              <template v-if="item"
                >{{ item.name }} ·
                {{ item.amount > 0 ? `${formatAmount(item.amount, item.unit)} at home` : 'none at home' }}</template
              ><template v-else-if="named">Not tracked at home, nothing to take.</template
              ><template v-else>Pick an item from home, or type a name for something you do not track.</template>
            </p>
          </div>
        </div>
        <footer
          class="shrink-0 space-y-2 border-t bg-background px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p v-if="!validDate" role="alert" class="text-xs text-destructive">Pick today or an earlier day.</p>
          <p v-else-if="!check.ok && named" role="alert" class="text-xs text-destructive">{{ check.problem }}</p>
          <p v-else-if="check.ok && check.use" class="text-xs text-muted-foreground">
            Takes {{ formatAmount(check.use.qty, unit) }} {{ item?.name }} from home. You can undo this afterwards.
          </p>
          <p v-else-if="check.ok" class="text-xs text-muted-foreground">
            Records it without taking anything from home.
          </p>
          <div class="flex gap-2">
            <Button type="button" variant="ghost" class="h-10" @click="open = false">Cancel</Button
            ><Button type="submit" class="h-10 flex-1 rounded-lg" :disabled="busy || !check.ok || !validDate">{{
              busy ? 'Adding…' : 'Add to meal'
            }}</Button>
          </div>
        </footer>
      </form>
    </DrawerContent>
  </Drawer>
</template>
