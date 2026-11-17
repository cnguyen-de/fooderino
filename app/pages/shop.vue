<script setup lang="ts">
import PantryRow from '~/components/pantry/PantryRow.vue';
import SearchDock from '~/components/pantry/SearchDock.vue';
import ItemSheet from '~/components/pantry/ItemSheet.vue';
import UnpackSheet from '~/components/pantry/UnpackSheet.vue';
import type { UndoHandle } from '~/composables/usePantry';
import type { ItemId, PantryItem } from '~~/types/pantry';
import { toast } from 'vue-sonner';
const { view, search, ops, historyComplete } = usePantry();
const act = usePantryAction();
const query = ref('');
const listPane = ref<HTMLElement | null>(null);
watch(query, () => listPane.value?.scrollTo({ top: 0 }), { flush: 'post' });
const selected = ref<ItemId | null>(null);
const unpack = ref(false);
const creating = ref(false);
const hits = computed(() => search(query.value));
const exact = computed(() => hits.value.some((h) => h.match === 'exact' && h.via !== 'tag'));
async function perform(work: () => Promise<UndoHandle | null>, message?: string) {
  const handle = await act(work, message);
  if (handle) query.value = '';
  return handle;
}
function list(item: PantryItem) {
  return perform(() => ops.addToShopping(item.id), `Listed ${item.name}`);
}
async function create() {
  creating.value = true;
  try {
    const id = await ops.createItem({ name: query.value.trim(), to_buy: 1 });
    if (id) {
      query.value = '';
      toast('Added to shopping list');
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not create item.');
  } finally {
    creating.value = false;
  }
}
</script>
<template>
  <NuxtLayout name="app"
    ><div ref="listPane" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <div class="flex items-baseline justify-between gap-2">
        <h1 class="text-xl font-semibold tracking-tight">Shopping<span class="text-primary">.</span></h1>
        <span class="text-xs tabular-nums text-muted-foreground"
          >{{ view.shopping.byStore.reduce((n, group) => n + group.items.length, 0) }} to buy</span
        >
      </div>
      <section v-if="query.trim()" class="space-y-1">
        <h2 class="text-sm text-muted-foreground">Add to your list</h2>
        <PantryRow
          v-for="hit in hits"
          :key="hit.item.id"
          :item="hit.item"
          :matched="hit.text"
          adding
          @edit="selected = hit.item.id"
          @action="list(hit.item)" /><Button v-if="!exact" :disabled="creating" class="h-9 w-full" @click="create"
          >Create ‘{{ query.trim() }}’</Button
        >
      </section>
      <section v-for="group in view.shopping.byStore" :key="group.name ?? 'anywhere'" class="space-y-1">
        <h2 class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {{ group.name ?? 'Anywhere' }}
        </h2>
        <PantryRow
          v-for="item in group.items"
          :key="item.id"
          :item="item"
          shop
          @edit="selected = item.id"
          @action="perform(() => ops.tick(item.id), `Bought ${item.name}`)" />
      </section>
      <p v-if="!view.shopping.byStore.length" class="text-muted-foreground">Your list is clear. Add something below.</p>
      <section v-if="view.shopping.probablyNeed.length" class="space-y-1">
        <div class="flex items-baseline justify-between gap-2">
          <h2 class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Probably need</h2>
          <span class="text-[10px] text-muted-foreground">From purchase history</span>
        </div>
        <PantryRow
          v-for="entry in view.shopping.probablyNeed"
          :key="entry.item.id"
          :item="entry.item"
          :qty="entry.qty"
          shop
          @edit="selected = entry.item.id"
          @action="perform(() => ops.tick(entry.item.id, entry.qty), `Bought ${entry.item.name}`)">
          <template #trailing
            ><Button
              variant="ghost"
              size="xs"
              class="shrink-0 text-xs text-muted-foreground"
              :aria-label="`Skip ${entry.item.name}`"
              @click="perform(() => ops.dismiss(entry.item.id))"
              >Skip</Button
            ></template
          >
        </PantryRow>
      </section>
      <p v-if="!historyComplete" class="text-xs text-muted-foreground">
        Suggestions will appear after your history syncs.
      </p>
      <Collapsible v-if="view.shopping.ranOut.length" class="rounded-lg bg-muted/30 px-2.5"
        ><CollapsibleTrigger class="min-h-8 w-full text-left text-xs font-semibold"
          >Ran out ({{ view.shopping.ranOut.length }}) ⌄</CollapsibleTrigger
        ><CollapsibleContent
          ><div
            v-for="item in view.shopping.ranOut"
            :key="item.id"
            class="flex min-h-9 items-center gap-2 border-t text-sm">
            <button class="min-w-0 flex-1 truncate text-left" @click="selected = item.id">{{ item.name }}</button
            ><Button
              variant="ghost"
              size="xs"
              class="text-primary"
              @click="perform(() => ops.addToShopping(item.id), `Listed ${item.name}`)"
              >Add</Button
            ><Button variant="ghost" size="xs" @click="perform(() => ops.dismiss(item.id))">Skip</Button>
          </div></CollapsibleContent
        ></Collapsible
      >
      <section
        v-if="view.shopping.bag.length"
        class="space-y-1 rounded-xl bg-primary/5 p-2.5 ring-1 ring-inset ring-primary/10">
        <h2 class="pb-1 text-xs font-semibold text-primary">In the bag ({{ view.shopping.bag.length }})</h2>
        <div v-for="line in view.shopping.bag" :key="line.id" class="flex min-h-8 items-center gap-2 text-sm">
          <button class="min-w-0 flex-1 truncate text-left" @click="selected = line.item.id">
            {{ line.item.name }} · {{ line.qty }}</button
          ><Button
            variant="ghost"
            size="xs"
            class="text-muted-foreground"
            :aria-label="`Remove ${line.item.name} from bag`"
            @click="perform(() => ops.cancelBag(line.id), `Removed ${line.item.name} from bag`)"
            >Remove</Button
          >
        </div>
        <Button class="h-9 w-full" @click="unpack = true">Unpack at home</Button>
      </section>
    </div>
    <SearchDock v-model="query" label="Add while shopping" placeholder="Add something to your list…" adding />
    <ItemSheet :id="selected" @changed="query = ''" @close="selected = null" /><UnpackSheet v-model:open="unpack"
  /></NuxtLayout>
</template>
