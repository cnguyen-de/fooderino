import type { LocalDate } from '~~/types/pantry';
import { daysBetween } from '~~/utils/pantry';
import type { MealNeeds } from '~~/utils/cook';

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

export function needsText(needs: MealNeeds): string {
  const dishes = needs.dishes ? `${needs.dishes} more dish${needs.dishes === 1 ? '' : 'es'}` : '';
  if (needs.soup) return dishes ? `Add a soup and ${dishes}` : 'Add a soup';
  return dishes ? `Add ${dishes}` : '';
}
