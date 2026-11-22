import type { ItemId, PantryItem, Unit } from '~~/types/pantry';

/** The homepage demo: a made-up household the hero plays through, so the page shows the app without a screenshot. */
export interface DemoState {
  tab: 'home' | 'shop';
  useSoon: { item: PantryItem; label: string }[];
  home: PantryItem[];
  shop: { store: string; items: PantryItem[] }[];
  bag: PantryItem[];
  /** The last change's toast; `from` names the housemate who made it. */
  toast: { text: string; from?: string } | null;
}

export interface DemoFrame {
  /** What the demo taps before the change, as a key the hero highlights. */
  tap?: string;
  apply: (state: DemoState) => void;
  /** How long the change stays on screen, in milliseconds. */
  hold: number;
}

export interface DemoStep {
  title: string;
  text: string;
  frames: DemoFrame[];
}

const item = (name: string, amount: number, to_buy = 0, unit: Unit = 'count'): PantryItem => ({
  id: name.toLowerCase() as ItemId,
  name,
  aliases: [],
  tags: [],
  unit,
  default_amount: 1,
  shelf_life_days: null,
  season: null,
  amount,
  to_buy,
  best_before: null
});

export function initialDemo(): DemoState {
  return {
    tab: 'home',
    useSoon: [{ item: item('Milk', 1), label: 'In 2 days' }],
    home: [item('Eggs', 6), item('Pasta', 1), item('Rice', 500, 0, 'gram'), item('Apples', 4)],
    shop: [
      { store: 'REWE', items: [item('Bananas', 0, 6), item('Tomatoes', 0, 4)] },
      { store: 'dm', items: [item('Toothpaste', 0, 1)] }
    ],
    bag: [],
    toast: null
  };
}

const find = (state: DemoState, id: string) => state.home.find((i) => i.id === id)!;
const store = (state: DemoState, name: string) => state.shop.find((s) => s.store === name)!;
function toBag(state: DemoState, id: string) {
  for (const group of state.shop) {
    const at = group.items.findIndex((i) => i.id === id);
    if (at >= 0) state.bag.push(...group.items.splice(at, 1));
  }
}

export const demoSteps: DemoStep[] = [
  {
    title: 'Use what you have',
    text: 'Tap Used it or − while you cook. Fooderino keeps count and reminds you what to use soon.',
    frames: [
      { hold: 1800, apply: () => {} },
      {
        tap: 'soon:milk',
        hold: 1500,
        apply: (s) => {
          s.useSoon = [];
          s.toast = { text: 'Used Milk' };
        }
      },
      {
        tap: 'home:eggs',
        hold: 1500,
        apply: (s) => {
          find(s, 'eggs').amount = 5;
          s.toast = { text: 'Used Eggs' };
        }
      }
    ]
  },
  {
    title: 'List what runs out',
    text: 'When something runs out, one tap puts it on the household’s shopping list.',
    frames: [
      {
        tap: 'home:pasta',
        hold: 1300,
        apply: (s) => {
          find(s, 'pasta').amount = 0;
          s.toast = { text: 'Used Pasta' };
        }
      },
      {
        tap: 'home:pasta',
        hold: 1500,
        apply: (s) => {
          find(s, 'pasta').to_buy = 1;
          store(s, 'REWE').items.unshift({ ...find(s, 'pasta') });
          s.toast = { text: 'Listed Pasta' };
        }
      }
    ]
  },
  {
    title: 'Shop together, by store',
    text: 'Everyone in the household sees the same list, sorted by store, and changes show up live.',
    frames: [
      {
        tap: 'tab:shop',
        hold: 1300,
        apply: (s) => {
          s.tab = 'shop';
          s.toast = null;
        }
      },
      {
        hold: 1700,
        apply: (s) => {
          store(s, 'REWE').items.push(item('Basil', 0, 1));
          s.toast = { text: 'Linh listed Basil', from: 'Linh' };
        }
      },
      { tap: 'shop:pasta', hold: 900, apply: (s) => toBag(s, 'pasta') },
      { tap: 'shop:basil', hold: 1500, apply: (s) => toBag(s, 'basil') }
    ]
  },
  {
    title: 'Unpack at home',
    text: 'Unpack the bag and your home counts are up to date. It all works offline, too.',
    frames: [
      {
        tap: 'unpack',
        hold: 3000,
        apply: (s) => {
          for (const bought of s.bag) {
            const home = s.home.find((i) => i.id === bought.id);
            if (home) Object.assign(home, { amount: home.amount + bought.to_buy, to_buy: 0 });
            else s.home.push({ ...bought, amount: bought.to_buy, to_buy: 0 });
          }
          s.toast = { text: `Unpacked ${s.bag.length} items` };
          s.bag = [];
          s.tab = 'home';
        }
      }
    ]
  }
];

/** The demo as it looks when step `index` starts. */
export function demoAt(index: number): DemoState {
  const state = initialDemo();
  for (const step of demoSteps.slice(0, index)) for (const frame of step.frames) frame.apply(state);
  return state;
}
