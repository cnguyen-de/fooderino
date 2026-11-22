import { describe, expect, it } from 'vitest';
import { demoAt, demoSteps, initialDemo, type DemoState } from '~~/utils/landing-demo';

/** Whether the hero shows what a frame taps, on the tab it is on. */
function onScreen(state: DemoState, tap: string) {
  const [kind, id] = tap.split(':');
  if (kind === 'tab') return true;
  if (kind === 'soon') return state.tab === 'home' && state.useSoon.some((e) => e.item.id === id);
  if (kind === 'home') return state.tab === 'home' && state.home.some((i) => i.id === id);
  if (kind === 'shop') return state.tab === 'shop' && state.shop.some((g) => g.items.some((i) => i.id === id));
  if (kind === 'unpack') return state.tab === 'shop' && state.bag.length > 0;
  return false;
}

describe('homepage demo', () => {
  it('only taps what is on screen', () => {
    const state = initialDemo();
    for (const step of demoSteps)
      for (const frame of step.frames) {
        if (frame.tap) expect(onScreen(state, frame.tap), frame.tap).toBe(true);
        frame.apply(state);
      }
  });

  it('ends at home with the bought items counted and the bag empty', () => {
    const end = demoAt(demoSteps.length);
    expect(end.tab).toBe('home');
    expect(end.bag).toEqual([]);
    expect(end.useSoon).toEqual([]);
    expect(end.home.find((i) => i.id === 'pasta')).toMatchObject({ amount: 1, to_buy: 0 });
    expect(end.home.find((i) => i.id === 'basil')).toMatchObject({ amount: 1, to_buy: 0 });
    expect(end.home.find((i) => i.id === 'eggs')?.amount).toBe(5);
  });

  it('starts each run from a fresh household', () => {
    demoAt(demoSteps.length);
    expect(demoAt(0)).toEqual(initialDemo());
  });
});
