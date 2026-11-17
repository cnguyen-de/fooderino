import { toast } from 'vue-sonner';
import type { RecipeIngredient } from '~~/types/sync';
export function useRecipeShopping() {
  const { search, ops } = usePantry();
  async function addIngredients(ingredients: RecipeIngredient[]) {
    try {
      for (const ingredient of ingredients) {
        const match = search(ingredient.name).find((hit) => hit.match === 'exact' && hit.via !== 'tag');
        if (match?.item.amount && match.item.amount > 0) continue;
        const qty = ingredient.amount && ingredient.amount > 0 ? ingredient.amount : 1;
        if (match) await ops.addToShopping(match.item.id, qty);
        else await ops.createItem({ name: ingredient.name, unit: ingredient.amount_type, to_buy: qty });
      }
      toast('Added ingredients to shopping list');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add ingredients.');
    }
  }
  return { addIngredients };
}
