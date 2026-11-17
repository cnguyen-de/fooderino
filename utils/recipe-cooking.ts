import type { Hit } from '~~/utils/pantry';
import type { ItemId, PantryItem } from '~~/types/pantry';
import type { RecipeIngredient } from '~~/types/sync';

export interface CookingLine {
  ingredient: RecipeIngredient;
  choices: PantryItem[];
  itemId: ItemId | '';
  qty: number;
  included: boolean;
}

export function cookingQuantity(ingredient: RecipeIngredient, item?: PantryItem): number {
  // A recipe's 500 g cannot be interpreted as 500 count items. Let the user
  // choose the count in the preview, starting at one.
  if (!item || item.unit !== ingredient.amount_type) return 1;
  return ingredient.amount && Number.isFinite(ingredient.amount) && ingredient.amount > 0 ? ingredient.amount : 1;
}

export function planRecipeCooking(
  ingredients: readonly RecipeIngredient[],
  search: (name: string) => readonly (Pick<Hit, 'match' | 'via'> & { item: PantryItem })[]
): CookingLine[] {
  return ingredients.map((ingredient) => {
    const choices = [
      ...new Map(
        search(ingredient.name)
          .filter((hit) => hit.match === 'exact' && hit.via !== 'tag')
          .map((hit) => [hit.item.id, hit.item])
      ).values()
    ];
    const item = choices.length === 1 ? choices[0] : undefined;
    return {
      ingredient,
      choices,
      itemId: item?.id ?? '',
      qty: cookingQuantity(ingredient, item),
      included: !!item && item.amount > 0
    };
  });
}
