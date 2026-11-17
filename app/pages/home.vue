<script setup lang="ts">
import PantryRow from '~/components/pantry/PantryRow.vue';
import ItemSheet from '~/components/pantry/ItemSheet.vue';
import type { ItemId, PantryItem } from '~~/types/pantry';
const { view, search, ops, ready } = usePantry();
const act = usePantryAction();
const query = ref('');
const selected = ref<ItemId | null>(null);
const results = computed(() => search(query.value));
const quickPicks = computed(() => {
  const home = view.value.home;
  const excluded = new Set(home.useSoon.map(({ item }) => item.id));
  const picks = home.mostUsed.filter((item) => item.amount > 0 && !excluded.has(item.id)).slice(0, 10);
  for (const item of picks) excluded.add(item.id);
  const candidates = home.byPlace
    .flatMap((group) => group.items)
    .filter((item) => item.amount > 0 && !excluded.has(item.id))
    .map((item) => ({
      item,
      purchasedAt: view.value.history(item.id).find((event) => event.kind === 'purchase')?.occurred_at
    }))
    .sort(
      (a, b) =>
        (b.purchasedAt ? Date.parse(b.purchasedAt) : 0) - (a.purchasedAt ? Date.parse(a.purchasedAt) : 0) ||
        a.item.name.localeCompare(b.item.name)
    );
  return [...picks, ...candidates.slice(0, 10 - picks.length).map(({ item }) => item)];
});
function use(item: PantryItem, bin = false) {
  return act(() => (bin ? ops.bin(item.id) : ops.useUp(item.id)), `${bin ? 'Binned' : 'Used'} ${item.name}`);
}
function action(item: PantryItem) {
  return item.amount > 0 ? use(item) : act(() => ops.addToShopping(item.id), `Listed ${item.name}`);
}
function matchText(hit: ReturnType<typeof search>[number]) {
  return hit.via === 'tag' && hit.item.tags.some((t) => t.kind === 'store' && t.name === hit.text)
    ? undefined
    : hit.text;
}
</script>
<template>
  <NuxtLayout name="app"
    ><div class="space-y-6 p-4">
      <h1 class="text-2xl font-semibold">At home</h1>
      <p v-if="!ready" role="status">Loading your items…</p>
      <section v-else-if="query.trim()" class="space-y-2">
        <h2 class="text-sm text-muted-foreground">Search results</h2>
        <PantryRow
          v-for="hit in results"
          :key="hit.item.id"
          :item="hit.item"
          :matched="matchText(hit)"
          @edit="selected = hit.item.id"
          @action="action(hit.item)" />
        <p v-if="!results.length">Nothing found. Add new items in Shopping.</p>
      </section>
      <template v-else>
        <section v-if="view.home.useSoon.length" class="space-y-2">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Use soon</h2>
          <div v-for="entry in view.home.useSoon" :key="entry.item.id" class="space-y-2 rounded-xl border p-3">
            <button class="flex w-full items-center justify-between gap-2 text-left" @click="selected = entry.item.id">
              <span class="font-semibold">{{ entry.item.name }}</span
              ><span class="rounded-md bg-orange-100 px-2 py-1 text-xs text-orange-900">{{
                entry.days_left < 0
                  ? `${-entry.days_left} days overdue`
                  : entry.days_left === 0
                    ? 'Today'
                    : `In ${entry.days_left} days`
              }}</span>
            </button>
            <div class="flex gap-2">
              <Button variant="secondary" class="h-11 flex-1" @click="use(entry.item)">Used it</Button
              ><Button variant="ghost" class="h-11" @click="use(entry.item, true)">Binned</Button>
            </div>
          </div>
        </section>
        <section v-if="quickPicks.length" class="space-y-2">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quick picks</h2>
          <PantryRow
            v-for="item in quickPicks"
            :key="item.id"
            :item="item"
            @edit="selected = item.id"
            @action="action(item)" />
        </section>
        <section class="space-y-2">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Places</h2>
          <Collapsible
            v-for="group in view.home.byPlace"
            :key="group.name ?? 'unsorted'"
            :default-open="view.home.byPlace.length === 1"
            class="rounded-xl border p-3"
            ><CollapsibleTrigger class="flex min-h-11 w-full items-center justify-between text-left font-medium"
              ><span>{{ group.name ?? 'Unsorted' }}</span
              ><span class="text-muted-foreground">{{ group.items.length }} · ⌄</span></CollapsibleTrigger
            ><CollapsibleContent class="space-y-2"
              ><PantryRow
                v-for="item in group.items"
                :key="item.id"
                :item="item"
                @edit="selected = item.id"
                @action="action(item)" /></CollapsibleContent
          ></Collapsible>
          <p v-if="!view.home.byPlace.length" class="py-4 text-muted-foreground">
            Your home is empty. Add items in Shopping, then unpack them here.
          </p>
        </section>
      </template>
    </div>
    <div
      class="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Input
        v-model="query"
        type="search"
        aria-label="Find something at home"
        placeholder="Find by name or tag…"
        class="h-12 rounded-xl text-base" />
    </div>
    <ItemSheet :id="selected" @close="selected = null"
  /></NuxtLayout>
</template>
