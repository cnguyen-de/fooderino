<script setup lang="ts">
import { ChefHat, Pencil, ShoppingBasket, Trash2 } from 'lucide-vue-next';
import {
  AlertDialogRoot,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel
} from 'radix-vue';
import type { IngredientStatus } from '~~/utils/cook';
import type { RecipeId } from '~~/types/cook';
import { formatAmount } from '~~/utils/pantry';
import { eatenText } from '~/utils/cook-format';
const route = useRoute();
const router = useRouter();
const cook = useCook();
const { today, ready } = cook;
const recipe = computed(() => cook.recipe(route.params.id as RecipeId));
const cooking = ref(false);
const deleting = ref(false);
const busy = ref(false);

function statusText(s: IngredientStatus): string {
  if (s.match.kind === 'none') return 'Not tracked';
  if (s.match.kind === 'several') return `${s.match.choices.length} matching items`;
  const item = s.match.item;
  return item.amount > 0 ? `${formatAmount(item.amount, item.unit)} at home` : 'None at home';
}
const STOCK_CLASS = {
  enough: 'bg-emerald-500',
  short: 'bg-orange-500',
  out: 'bg-destructive',
  untracked: 'bg-muted-foreground/30'
} as const;

async function list() {
  if (!recipe.value || busy.value) return;
  busy.value = true;
  await cook.addMissingToShopping(recipe.value.id);
  busy.value = false;
}
async function remove() {
  if (!recipe.value || busy.value) return;
  busy.value = true;
  const done = await cook.deleteRecipe(recipe.value.id);
  busy.value = false;
  if (done) await router.replace('/cook/recipes');
}
</script>
<template>
  <NuxtLayout name="app">
    <CookNav />
    <div class="space-y-4 p-3">
      <p v-if="!ready" role="status">Loading…</p>
      <p v-else-if="!recipe" class="text-muted-foreground">
        This recipe is gone. <NuxtLink to="/cook/recipes" class="text-primary underline">Back to recipes</NuxtLink>
      </p>
      <template v-else>
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-semibold tracking-tight">{{ recipe.name }}</h1>
            <KindBadge :kind="recipe.kind" />
          </div>
          <p class="text-xs text-muted-foreground">{{ eatenText(recipe.lastEaten, today) }}</p>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <Button class="col-span-2 h-10 gap-2 rounded-lg" @click="cooking = true"
            ><ChefHat class="size-4" />Add to meal</Button
          >
          <Button as-child variant="secondary" class="h-9 gap-1.5"
            ><NuxtLink :to="`/cook/recipes/${recipe.id}/edit`"><Pencil class="size-3.5" />Edit</NuxtLink></Button
          >
          <Button variant="secondary" class="h-9 gap-1.5" :disabled="busy || !recipe.ingredients.length" @click="list"
            ><ShoppingBasket class="size-3.5" />Add missing to list</Button
          >
        </div>
        <section class="space-y-1">
          <h2 class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Ingredients</h2>
          <ul v-if="recipe.ingredientsAtHome.length" class="divide-y rounded-xl border bg-card">
            <li v-for="(s, index) in recipe.ingredientsAtHome" :key="index" class="flex items-center gap-2.5 px-3 py-2">
              <span class="size-2 shrink-0 rounded-full" :class="STOCK_CLASS[s.stock]" aria-hidden="true" />
              <span class="min-w-0 flex-1">
                <span class="font-medium">{{ s.ingredient.name }}</span
                ><span v-if="s.ingredient.qty" class="text-muted-foreground">
                  · {{ formatAmount(s.ingredient.qty.amount, s.ingredient.qty.unit) }}</span
                >
              </span>
              <span
                class="shrink-0 text-xs"
                :class="
                  s.stock === 'out'
                    ? 'text-destructive'
                    : s.stock === 'short'
                      ? 'text-orange-700 dark:text-orange-300'
                      : 'text-muted-foreground'
                "
                >{{ statusText(s) }}</span
              >
            </li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">No ingredients.</p>
        </section>
        <section v-if="recipe.instructions" class="space-y-1">
          <h2 class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Instructions</h2>
          <MarkdownRenderer :source="recipe.instructions" class="rounded-xl border bg-card p-3 text-sm" />
        </section>
        <Button variant="ghost" class="w-full gap-1.5 text-destructive hover:text-destructive" @click="deleting = true"
          ><Trash2 class="size-4" />Delete recipe</Button
        >
        <CookSheet v-model:open="cooking" :recipe="recipe" />
      </template>
    </div>
    <AlertDialogRoot v-model:open="deleting">
      <AlertDialogPortal>
        <AlertDialogOverlay class="fixed inset-0 z-[60] bg-black/60" />
        <AlertDialogContent
          class="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-5 shadow-xl">
          <AlertDialogTitle class="text-base font-semibold">Delete “{{ recipe?.name }}”?</AlertDialogTitle>
          <AlertDialogDescription class="mt-2 text-sm text-muted-foreground"
            >It disappears from your recipes for everyone in the household. Past meals keep its
            name.</AlertDialogDescription
          >
          <div class="mt-5 flex justify-end gap-2">
            <AlertDialogCancel as-child
              ><Button type="button" variant="secondary" :disabled="busy">Cancel</Button></AlertDialogCancel
            >
            <Button type="button" variant="destructive" :disabled="busy" @click="remove">{{
              busy ? 'Deleting…' : 'Delete recipe'
            }}</Button>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>
  </NuxtLayout>
</template>
