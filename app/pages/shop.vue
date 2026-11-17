<script setup lang="ts">
import PantryRow from '~/components/pantry/PantryRow.vue';
import ItemSheet from '~/components/pantry/ItemSheet.vue';
import UnpackSheet from '~/components/pantry/UnpackSheet.vue';
import type { ItemId } from '~~/types/pantry';
import { toast } from 'vue-sonner';
const { view, search, ops, historyComplete } = usePantry();
const act = usePantryAction();
const query = ref('');
const selected = ref<ItemId | null>(null);
const unpack = ref(false);
const creating = ref(false);
const hits = computed(() => search(query.value));
const exact = computed(() => hits.value.some((h) => h.match === 'exact' && h.via !== 'tag'));
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
    ><div class="space-y-6 p-4">
      <h1 class="text-2xl font-semibold">Shopping</h1>
      <section v-if="query.trim()" class="space-y-2">
        <h2 class="text-sm text-muted-foreground">Add to your list</h2>
        <PantryRow
          v-for="hit in hits"
          :key="hit.item.id"
          :item="hit.item"
          :matched="hit.text"
          adding
          @edit="selected = hit.item.id"
          @action="act(() => ops.addToShopping(hit.item.id), `Listed ${hit.item.name}`)" /><Button
          v-if="!exact"
          :disabled="creating"
          class="h-12 w-full"
          @click="create"
          >Create ‘{{ query.trim() }}’</Button
        >
      </section>
      <section v-for="group in view.shopping.byStore" :key="group.name ?? 'anywhere'" class="space-y-2">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {{ group.name ?? 'Anywhere' }}
        </h2>
        <PantryRow
          v-for="item in group.items"
          :key="item.id"
          :item="item"
          shop
          @edit="selected = item.id"
          @action="act(() => ops.tick(item.id), `Bought ${item.name}`)" />
      </section>
      <p v-if="!view.shopping.byStore.length" class="text-muted-foreground">Your list is clear. Add something below.</p>
      <section v-if="view.shopping.probablyNeed.length" class="space-y-2">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Probably need</h2>
        <div
          v-for="entry in view.shopping.probablyNeed"
          :key="entry.item.id"
          class="rounded-xl border border-dashed p-2 text-muted-foreground">
          <PantryRow
            :item="entry.item"
            :qty="entry.qty"
            shop
            @edit="selected = entry.item.id"
            @action="act(() => ops.tick(entry.item.id, entry.qty), `Bought ${entry.item.name}`)" />
          <div class="flex items-center justify-between">
            <p class="text-xs">Based on your purchase history</p>
            <Button variant="ghost" @click="act(() => ops.dismiss(entry.item.id))">Skip</Button>
          </div>
        </div>
      </section>
      <p v-if="!historyComplete" class="text-xs text-muted-foreground">
        Suggestions will appear after your history syncs.
      </p>
      <Collapsible v-if="view.shopping.ranOut.length" class="rounded-xl border p-3"
        ><CollapsibleTrigger class="min-h-11 w-full text-left font-medium"
          >Ran out ({{ view.shopping.ranOut.length }}) ⌄</CollapsibleTrigger
        ><CollapsibleContent
          ><div v-for="item in view.shopping.ranOut" :key="item.id" class="flex items-center gap-2 border-t py-2">
            <button class="flex-1 text-left" @click="selected = item.id">{{ item.name }}</button
            ><Button variant="secondary" @click="act(() => ops.addToShopping(item.id), `Listed ${item.name}`)"
              >Add</Button
            ><Button variant="ghost" @click="act(() => ops.dismiss(item.id))">Skip</Button>
          </div></CollapsibleContent
        ></Collapsible
      >
      <section v-if="view.shopping.bag.length" class="space-y-3 rounded-xl bg-primary/10 p-4">
        <h2 class="font-semibold">In the bag ({{ view.shopping.bag.length }})</h2>
        <div v-for="line in view.shopping.bag" :key="line.id" class="flex items-center gap-2">
          <button class="flex-1 text-left" @click="selected = line.item.id">
            {{ line.item.name }} · {{ line.qty }}</button
          ><Button
            variant="ghost"
            :aria-label="`Remove ${line.item.name} from bag`"
            @click="act(() => ops.cancelBag(line.id), `Removed ${line.item.name} from bag`)"
            >Remove</Button
          >
        </div>
        <Button class="h-12 w-full" @click="unpack = true">Unpack at home</Button>
      </section>
    </div>
    <div
      class="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Input
        v-model="query"
        aria-label="Add while shopping"
        type="search"
        placeholder="Add something to your list…"
        class="h-12 rounded-xl text-base" />
    </div>
    <ItemSheet :id="selected" @close="selected = null" /><UnpackSheet v-model:open="unpack"
  /></NuxtLayout>
</template>
