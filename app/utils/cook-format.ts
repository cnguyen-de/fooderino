import type { LocalDate } from '~~/types/pantry';
import type { Quantity, RecipeKind } from '~~/types/cook';
import { daysBetween, formatAmount } from '~~/utils/pantry';
import type { MealNeeds } from '~~/utils/cook';

/** What the app calls each kind of recipe, alone and as a list heading. */
export const KIND_TEXT: Record<RecipeKind, { one: string; many: string }> = {
  dish: { one: 'Dish', many: 'Dishes' },
  soup: { one: 'Soup', many: 'Soups' },
  whole_meal: { one: 'One-dish', many: 'One-dish meals' }
};

export function eatenText(lastEaten: LocalDate | null, today: LocalDate): string {
  if (!lastEaten) return 'Never eaten';
  const days = daysBetween(lastEaten, today);
  if (days <= 0) return 'Eaten today';
  if (days === 1) return 'Eaten yesterday';
  return `Last eaten ${days} days ago`;
}

export function dateText(date: LocalDate, today: LocalDate): string {
  const days = daysBetween(date, today);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
}

export function addedText(name: string, date: LocalDate, today: LocalDate): string {
  const day = dateText(date, today);
  if (day === 'Today') return `Added ${name} to today`;
  if (day === 'Yesterday') return `Added ${name} to yesterday's meal`;
  return `Added ${name} to ${day}`;
}

export const qtyText = (qty: Quantity | null) => (qty ? formatAmount(qty.amount, qty.unit) : 'some');

export function needsText(needs: MealNeeds): string {
  const dishes = needs.dishes ? `${needs.dishes} more dish${needs.dishes === 1 ? '' : 'es'}` : '';
  if (needs.soup) return dishes ? `Add a soup and ${dishes}` : 'Add a soup';
  return dishes ? `Add ${dishes}` : '';
}
