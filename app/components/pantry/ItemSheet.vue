<script setup lang="ts">
import type { ItemId, ItemMetadata } from '~~/types/pantry';
import { localDate } from '~~/utils/pantry';
import { toast } from 'vue-sonner';
const props = defineProps<{ id: ItemId | null }>();
const emit = defineEmits<{ close: [] }>();
const { view, search, ops } = usePantry();
const act = usePantryAction();
const draft = ref<ItemMetadata>({
  name: '',
  aliases: [],
  tags: [],
  unit: 'count',
  default_amount: 1,
  shelf_life_days: null
});
const amount = ref(0);
const best = ref('');
const shelf = ref('');
const alias = ref('');
const tag = ref('');
const kind = ref<'place' | 'store' | 'other'>('place');
const mergeQuery = ref('');
const merging = ref(false);
const deleting = ref(false);
const busy = ref(false);
watch(
  () => props.id,
  (id) => {
    const item = id ? view.value.byId(id) : null;
    if (!item) return;
    draft.value = {
      name: item.name,
      aliases: [...item.aliases],
      tags: item.tags.map((t) => ({ ...t })),
      unit: item.unit,
      default_amount: item.default_amount,
      shelf_life_days: item.shelf_life_days
    };
    amount.value = item.amount;
    best.value = item.best_before ?? '';
    shelf.value = item.shelf_life_days?.toString() ?? '';
    alias.value = '';
    tag.value = '';
    merging.value = false;
    deleting.value = false;
    mergeQuery.value = '';
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
  if (value && !draft.value.tags.some((t) => t.kind === kind.value && t.name === value))
    draft.value.tags.push({ kind: kind.value, name: value });
  tag.value = '';
}
async function save() {
  if (!props.id) return;
  busy.value = true;
  try {
    addAlias();
    addTag();
    const handle = await ops.editItem(props.id, {
      ...draft.value,
      default_amount: Number(draft.value.default_amount),
      shelf_life_days: shelf.value === '' ? null : Number(shelf.value),
      amount: Number(amount.value),
      best_before: best.value ? localDate(best.value) : null
    });
    if (handle) {
      toast('Item saved');
      emit('close');
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not save item.');
  } finally {
    busy.value = false;
  }
}
async function merge(into: ItemId) {
  if (props.id && (await act(() => ops.merge(props.id!, into)))) emit('close');
}
async function remove() {
  if (props.id && (await act(() => ops.deleteItem(props.id!), 'Item deleted'))) emit('close');
}
</script>
<template>
  <Drawer :open="!!id" @update:open="!$event && emit('close')"
    ><DrawerContent class="mx-auto max-h-[92dvh] max-w-xl">
      <DrawerHeader
        ><DrawerTitle>Edit item</DrawerTitle
        ><DrawerDescription>Save names, tags and stock together.</DrawerDescription></DrawerHeader
      >
      <form class="space-y-4 overflow-y-auto px-4 pb-6" @submit.prevent="save">
        <label class="block space-y-1">Name<Input v-model="draft.name" required class="text-base" /></label>
        <fieldset class="space-y-2">
          <legend>Aliases</legend>
          <div class="flex flex-wrap gap-2">
            <Button
              v-for="(value, i) in draft.aliases"
              :key="value"
              type="button"
              variant="secondary"
              :aria-label="`Remove alias ${value}`"
              @click="draft.aliases.splice(i, 1)"
              >{{ value }} ×</Button
            >
          </div>
          <div class="flex gap-2">
            <Input v-model="alias" aria-label="New alias" class="text-base" @keydown.enter.prevent="addAlias" /><Button
              type="button"
              variant="outline"
              @click="addAlias"
              >Add alias</Button
            >
          </div>
        </fieldset>
        <fieldset class="space-y-2">
          <legend>Tags</legend>
          <div class="flex flex-wrap gap-2">
            <Button
              v-for="(value, i) in draft.tags"
              :key="value.kind + value.name"
              type="button"
              variant="secondary"
              :aria-label="`Remove ${value.kind} ${value.name}`"
              @click="draft.tags.splice(i, 1)"
              >{{ value.kind }}: {{ value.name }} ×</Button
            >
          </div>
          <div class="flex gap-2">
            <select v-model="kind" aria-label="Tag kind" class="rounded-md border bg-background text-base">
              <option>place</option>
              <option>store</option>
              <option>other</option></select
            ><Input v-model="tag" aria-label="New tag" class="text-base" @keydown.enter.prevent="addTag" /><Button
              type="button"
              variant="outline"
              @click="addTag"
              >Add tag</Button
            >
          </div>
        </fieldset>
        <div class="grid grid-cols-2 gap-3">
          <label
            >Unit<select v-model="draft.unit" class="block h-10 w-full rounded-md border bg-background text-base">
              <option value="count">Count</option>
              <option value="gram">Grams</option>
            </select></label
          ><label
            >Default amount<Input
              v-model="draft.default_amount"
              type="number"
              min="0.001"
              step="any"
              required
              class="text-base" /></label
          ><label>Shelf life (days)<Input v-model="shelf" type="number" min="0" step="1" class="text-base" /></label
          ><label
            >Amount at home<Input v-model="amount" type="number" min="0" step="any" required class="text-base"
          /></label>
        </div>
        <label class="block">Best-before<Input v-model="best" type="date" class="text-base" /></label>
        <div class="flex gap-2">
          <Button type="submit" :disabled="busy" class="flex-1">Save</Button
          ><Button type="button" variant="outline" @click="emit('close')">Close</Button
          ><Button
            type="button"
            variant="secondary"
            @click="id && act(() => ops.addToShopping(id!), `Listed ${draft.name}`)"
            >Add to list</Button
          >
        </div>
        <Button type="button" variant="ghost" @click="merging = !merging">Merge into…</Button>
        <div v-if="merging" class="space-y-2">
          <p class="text-sm text-muted-foreground">Combines stock, names and tags. This cannot be undone.</p>
          <Input
            v-model="mergeQuery"
            aria-label="Find merge target"
            placeholder="Find another item"
            class="text-base" /><Button
            v-for="hit in matches"
            :key="hit.item.id"
            type="button"
            variant="outline"
            class="w-full"
            @click="merge(hit.item.id)"
            >Merge into {{ hit.item.name }}</Button
          >
        </div>
        <Button type="button" variant="ghost" class="text-destructive" @click="deleting = !deleting"
          >Delete item…</Button
        >
        <div v-if="deleting">
          <p>Remove this item from your household?</p>
          <Button type="button" variant="destructive" @click="remove">Delete item</Button>
        </div>
      </form>
    </DrawerContent></Drawer
  >
</template>
