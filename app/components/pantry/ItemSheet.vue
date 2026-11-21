<script setup lang="ts">
import type { ItemId, ItemMetadata } from '~~/types/pantry';
import type { Month } from '~~/types/season';
import TagCombobox from '~/components/pantry/TagCombobox.vue';
import { localDate, normName } from '~~/utils/pantry';
import { formatSeason, matchCalendar, monthName } from '~~/utils/seasons';
import { SEASON_CALENDAR } from '~~/utils/seasons/calendar';
import { toast } from 'vue-sonner';
import { ChevronDown, History, MapPin, Plus, Store, Tag, X } from 'lucide-vue-next';
import {
  AlertDialogRoot,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel
} from 'radix-vue';
const props = defineProps<{ id: ItemId | null; creating?: boolean; initialName?: string }>();
const emit = defineEmits<{ close: []; changed: [] }>();
const { view, search, ops, tagOptions } = usePantry();
const act = usePantryAction();
const newItem = (name = ''): ItemMetadata => ({
  name,
  aliases: [],
  tags: [],
  unit: 'count',
  default_amount: 1,
  shelf_life_days: null,
  season: null
});
const draft = ref(newItem());
const amount = ref(0);
const toBuy = ref(0);
let loadedToBuy = 0;
const best = ref('');
const shelf = ref('');
const alias = ref('');
const tag = ref('');
const kind = ref<'place' | 'store' | 'other'>('place');
const tagChoices = computed(() => tagOptions.value.filter((t) => t.kind === kind.value).map((t) => t.name));
watch(kind, () => {
  tag.value = '';
});
function selectTag(value: string) {
  tag.value = value;
  addTag();
}
const mergeQuery = ref('');
const merging = ref(false);
const deleting = ref(false);
const removing = ref(false);
const busy = ref(false);
const more = ref(false);
const MONTHS = Array.from({ length: 12 }, (_, i) => (i + 1) as Month);
/** A calendar season follows the name as it is typed; one the user picked or cleared stays. */
const seasonOrigin = ref<'calendar' | 'user' | null>(null);
const calendarSeason = computed(() =>
  props.creating ? (matchCalendar(SEASON_CALENDAR, [draft.value.name, ...draft.value.aliases])?.season ?? null) : null
);
function prefillSeason() {
  if (!props.creating || seasonOrigin.value === 'user') return;
  draft.value.season = calendarSeason.value && { ...calendarSeason.value };
  seasonOrigin.value = calendarSeason.value ? 'calendar' : null;
}
watch(calendarSeason, prefillSeason);
function pickMonth(end: 'from' | 'to', value: string) {
  seasonOrigin.value = 'user';
  if (value === '') {
    draft.value.season = null;
    return;
  }
  const month = Number(value) as Month;
  draft.value.season = { ...(draft.value.season ?? { from: month, to: month }), [end]: month };
}
function clearSeason() {
  draft.value.season = null;
  seasonOrigin.value = 'user';
}
watch([() => props.id, () => props.creating], ([id, creating]) => {
  const item = id ? view.value.byId(id) : null;
  if (!item && !creating) return;
  draft.value = item
    ? {
        name: item.name,
        aliases: [...item.aliases],
        tags: item.tags.map((t) => ({ ...t })),
        unit: item.unit,
        default_amount: item.default_amount,
        shelf_life_days: item.shelf_life_days,
        season: item.season
      }
    : newItem(props.initialName?.trim());
  amount.value = item?.amount ?? 1;
  toBuy.value = loadedToBuy = item?.to_buy ?? 0;
  best.value = item?.best_before ?? '';
  shelf.value = item?.shelf_life_days?.toString() ?? '';
  alias.value = '';
  tag.value = '';
  more.value = false;
  seasonOrigin.value = null;
  prefillSeason();
  merging.value = false;
  deleting.value = false;
  mergeQuery.value = '';
});
// Follow the live list amount (e.g. after "Add to list") until the field is edited.
watch(
  () => (props.id ? view.value.byId(props.id)?.to_buy : undefined),
  (live) => {
    if (live !== undefined && Number(toBuy.value) === loadedToBuy) toBuy.value = loadedToBuy = live;
  }
);
const matches = computed(() => search(mergeQuery.value).filter((h) => h.item.id !== props.id));
function addAlias() {
  const value = alias.value.trim();
  if (value && !draft.value.aliases.includes(value)) draft.value.aliases.push(value);
  alias.value = '';
}
function addTag() {
  const value = tag.value.trim();
  if (value && !draft.value.tags.some((t) => t.kind === kind.value && normName(t.name) === normName(value)))
    draft.value.tags.push({ kind: kind.value, name: value });
  tag.value = '';
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  try {
    addAlias();
    addTag();
    const fields = {
      ...draft.value,
      default_amount: Number(draft.value.default_amount),
      shelf_life_days: shelf.value === '' ? null : Number(shelf.value),
      amount: Number(amount.value),
      ...(Number(toBuy.value) !== loadedToBuy && { to_buy: Number(toBuy.value) }),
      best_before: best.value ? localDate(best.value) : null
    };
    if (props.creating) {
      if (!(await ops.createItem(fields))) return;
      toast('Added to Home');
    } else if (props.id) {
      if (await ops.editItem(props.id, fields)) toast('Item saved');
    }
    emit('changed');
    emit('close');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not save item.');
  } finally {
    busy.value = false;
  }
}
async function list() {
  if (props.id && (await act(() => ops.addToShopping(props.id!), `Listed ${draft.value.name}`))) emit('changed');
}
async function merge(into: ItemId) {
  if (props.id && (await act(() => ops.merge(props.id!, into)))) {
    emit('changed');
    emit('close');
  }
}
async function remove() {
  if (!props.id || removing.value) return;
  removing.value = true;
  const handle = await act(() => ops.deleteItem(props.id!), 'Item deleted');
  removing.value = false;
  if (handle) {
    deleting.value = false;
    emit('changed');
    emit('close');
  }
}
</script>
<template>
  <Drawer :open="!!id || !!creating" @update:open="!$event && emit('close')">
    <DrawerContent class="mx-auto max-h-[90dvh] max-w-xl rounded-t-2xl">
      <DrawerHeader class="flex items-center justify-between px-5 pb-3 pt-3 text-left">
        <div>
          <DrawerTitle class="text-base">{{ creating ? 'Add item at home' : 'Item details' }}</DrawerTitle>
          <DrawerDescription class="sr-only">Name, quantity and storage for this item.</DrawerDescription>
        </div>
        <button
          type="button"
          aria-label="Close item"
          class="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
          @click="emit('close')">
          <X class="size-4" />
        </button>
      </DrawerHeader>
      <form class="flex min-h-0 flex-1 flex-col" @submit.prevent="save">
        <div class="min-h-0 space-y-4 overflow-y-auto px-5 pb-4">
          <label class="block">
            <span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Name</span>
            <Input
              v-model="draft.name"
              required
              class="mt-1 h-10 rounded-lg border-0 bg-muted/50 text-base font-semibold shadow-none" />
          </label>
          <div v-if="id" class="flex items-center justify-between gap-2">
            <NuxtLink
              :to="{ path: '/logs', query: { item: id } }"
              class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
              @click="emit('close')"
              ><History class="size-3.5" />View history</NuxtLink
            >
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class="gap-1 text-xs text-primary hover:bg-primary/10 hover:text-primary"
              @click="list"
              ><Plus class="size-3.5" />Add to list</Button
            >
          </div>
          <section class="space-y-2 rounded-xl bg-muted/40 p-3">
            <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Quantity<span v-if="draft.unit === 'gram'"> · grams</span>
            </h3>
            <div class="grid grid-cols-3 gap-3">
              <label class="flex flex-col justify-end space-y-1 text-xs font-medium"
                >At home<Input
                  v-model="amount"
                  aria-label="Amount at home"
                  type="number"
                  min="0"
                  step="any"
                  required
                  class="h-9 rounded-lg bg-background text-base"
              /></label>
              <label class="flex flex-col justify-end space-y-1 text-xs font-medium"
                >To buy<Input
                  v-model="toBuy"
                  aria-label="Amount to buy"
                  type="number"
                  min="0"
                  step="any"
                  required
                  class="h-9 rounded-lg bg-background text-base"
              /></label>
              <label class="flex flex-col justify-end space-y-1 text-xs font-medium"
                >Default amount<Input
                  v-model="draft.default_amount"
                  aria-label="Default amount"
                  type="number"
                  min="0"
                  step="any"
                  required
                  class="h-9 rounded-lg bg-background text-base"
              /></label>
            </div>
          </section>
          <section class="space-y-2 rounded-xl bg-muted/40 p-3">
            <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Storage</h3>
            <div class="grid grid-cols-2 gap-3">
              <label class="min-w-0 space-y-1 text-xs font-medium"
                >Best before<Input
                  v-model="best"
                  aria-label="Best before"
                  type="date"
                  class="h-9 min-w-0 rounded-lg bg-background text-base"
              /></label>
              <label class="space-y-1 text-xs font-medium"
                >Shelf life · days<Input
                  v-model="shelf"
                  aria-label="Shelf life in days"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Optional"
                  class="h-9 rounded-lg bg-background text-base"
              /></label>
            </div>
          </section>
          <section class="space-y-2">
            <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Places &amp; stores
            </h3>
            <div v-if="draft.tags.length" class="flex flex-wrap gap-1.5">
              <button
                v-for="(value, i) in draft.tags"
                :key="value.kind + value.name"
                type="button"
                class="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                :aria-label="`Remove ${value.kind} ${value.name}`"
                @click="draft.tags.splice(i, 1)">
                <component
                  :is="value.kind === 'store' ? Store : value.kind === 'place' ? MapPin : Tag"
                  class="size-3 shrink-0"
                  aria-hidden="true" /><span class="truncate">{{ value.name }}</span
                ><X class="size-3 shrink-0" aria-hidden="true" />
              </button>
            </div>
            <div class="flex gap-2">
              <select v-model="kind" aria-label="Tag kind" class="h-9 rounded-lg border bg-muted/40 px-2 text-xs">
                <option value="place">Place</option>
                <option value="store">Store</option>
                <option value="other">Other</option>
              </select>
              <TagCombobox
                v-model="tag"
                :options="tagChoices"
                :placeholder="
                  kind === 'store' ? 'Find or add store…' : kind === 'place' ? 'Find or add place…' : 'Find or add tag…'
                "
                @select="selectTag" />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-label="Add tag"
                class="size-9 shrink-0 p-0"
                @click="addTag"
                ><Plus class="size-4"
              /></Button>
            </div>
          </section>
          <Collapsible v-model:open="more" class="border-t pt-2">
            <CollapsibleTrigger
              class="flex h-8 w-full items-center justify-between text-xs font-medium text-muted-foreground"
              ><span
                >More options<span v-if="draft.season" class="font-normal">
                  · Season {{ formatSeason(draft.season) }}</span
                ></span
              ><ChevronDown class="size-3.5 transition-transform" :class="more && 'rotate-180'"
            /></CollapsibleTrigger>
            <CollapsibleContent class="space-y-3 pt-2">
              <fieldset class="space-y-2">
                <div class="flex items-baseline justify-between gap-2">
                  <legend class="text-xs font-medium">Season</legend>
                  <span v-if="seasonOrigin === 'calendar' && draft.season" class="text-[11px] text-muted-foreground"
                    >Filled from the season calendar</span
                  >
                </div>
                <div class="flex items-end gap-2">
                  <label class="min-w-0 flex-1 space-y-1 text-xs"
                    ><span class="text-muted-foreground">Begin</span
                    ><select
                      aria-label="Season begins"
                      class="h-9 w-full rounded-lg border bg-muted/40 px-2 text-sm"
                      :value="draft.season?.from ?? ''"
                      @change="pickMonth('from', ($event.target as HTMLSelectElement).value)">
                      <option value="">No season</option>
                      <option v-for="m in MONTHS" :key="m" :value="m">{{ monthName(m, 'long') }}</option>
                    </select></label
                  ><label class="min-w-0 flex-1 space-y-1 text-xs"
                    ><span class="text-muted-foreground">End</span
                    ><select
                      aria-label="Season ends"
                      class="h-9 w-full rounded-lg border bg-muted/40 px-2 text-sm"
                      :value="draft.season?.to ?? ''"
                      @change="pickMonth('to', ($event.target as HTMLSelectElement).value)">
                      <option value="">No season</option>
                      <option v-for="m in MONTHS" :key="m" :value="m">{{ monthName(m, 'long') }}</option>
                    </select></label
                  ><Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    class="h-9 shrink-0 text-xs text-muted-foreground"
                    :disabled="!draft.season"
                    @click="clearSeason"
                    >No season</Button
                  >
                </div>
              </fieldset>
              <div class="space-y-2">
                <label for="item-alias" class="text-xs font-medium">Other names</label>
                <div v-if="draft.aliases.length" class="flex flex-wrap gap-1.5">
                  <button
                    v-for="(value, i) in draft.aliases"
                    :key="value"
                    type="button"
                    class="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
                    :aria-label="`Remove alias ${value}`"
                    @click="draft.aliases.splice(i, 1)">
                    {{ value }}<X class="size-3" />
                  </button>
                </div>
                <div class="flex gap-2">
                  <Input
                    id="item-alias"
                    v-model="alias"
                    aria-label="New alias"
                    placeholder="Another name to search by"
                    class="h-9 min-w-0 text-base"
                    @keydown.enter.prevent="addAlias" /><Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label="Add alias"
                    class="size-9 shrink-0 p-0"
                    @click="addAlias"
                    ><Plus class="size-4"
                  /></Button>
                </div>
              </div>
              <div v-if="id" class="flex gap-2">
                <Button type="button" variant="ghost" size="xs" @click="merging = !merging">Merge into…</Button
                ><Button type="button" variant="ghost" size="xs" class="text-destructive" @click="deleting = !deleting"
                  >Delete item…</Button
                >
              </div>
              <div v-if="merging" class="space-y-2 rounded-lg bg-muted/40 p-3">
                <p class="text-xs text-muted-foreground">Combines stock, names and tags. This cannot be undone.</p>
                <Input
                  v-model="mergeQuery"
                  aria-label="Find merge target"
                  placeholder="Find another item"
                  class="h-9 text-base" /><Button
                  v-for="hit in matches"
                  :key="hit.item.id"
                  type="button"
                  variant="outline"
                  size="sm"
                  class="w-full"
                  @click="merge(hit.item.id)"
                  >Merge into {{ hit.item.name }}</Button
                >
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
        <footer
          class="flex shrink-0 gap-2 border-t bg-background px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button type="button" variant="ghost" class="h-10 text-muted-foreground" @click="emit('close')"
            >Cancel</Button
          >
          <Button type="submit" :disabled="busy" class="h-10 flex-1 rounded-lg">{{
            busy ? 'Saving…' : creating ? 'Add item' : 'Save changes'
          }}</Button>
        </footer>
      </form>
    </DrawerContent>
  </Drawer>
  <AlertDialogRoot v-model:open="deleting">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-[60] bg-black/60" />
      <AlertDialogContent
        class="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-5 shadow-xl">
        <AlertDialogTitle class="text-base font-semibold">Delete “{{ draft.name }}”?</AlertDialogTitle>
        <AlertDialogDescription class="mt-2 text-sm text-muted-foreground"
          >It will disappear from your home and shopping list.</AlertDialogDescription
        >
        <div class="mt-5 flex justify-end gap-2">
          <AlertDialogCancel as-child
            ><Button type="button" variant="secondary" :disabled="removing">Cancel</Button></AlertDialogCancel
          >
          <Button type="button" variant="destructive" :disabled="removing" @click="remove">{{
            removing ? 'Deleting…' : 'Delete item'
          }}</Button>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
