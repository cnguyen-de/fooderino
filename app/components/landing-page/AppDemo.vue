<script setup lang="ts">
import PantryRow from '~/components/pantry/PantryRow.vue';
import { ChefHat, History, House, Leaf, Search, Settings, ShoppingBasket, X } from 'lucide-vue-next';
import { useElementVisibility } from '@vueuse/core';
import { demoAt, demoSteps, initialDemo } from '~~/utils/landing-demo';

/** How long a tap shows before its change lands, in milliseconds. */
const TAP = 650;

const root = ref<HTMLElement | null>(null);
const visible = useElementVisibility(root);
const state = ref(initialDemo());
const step = ref(0);
const tap = ref<string | null>(null);
const tabs = [
  { key: 'home', name: 'Home', icon: House },
  { key: 'shop', name: 'Shopping', icon: ShoppingBasket },
  { key: 'cook', name: 'Cook', icon: ChefHat }
] as const;
const homeCount = computed(() => state.value.useSoon.length + state.value.home.length);
const shopCount = computed(() => state.value.shop.reduce((n, group) => n + group.items.length, 0));

let run = 0;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Waits `ms` while the demo is on screen. False once another run has started. */
async function pause(ms: number, id: number) {
  while (!visible.value && id === run) await new Promise((resolve) => setTimeout(resolve, 250));
  await new Promise((resolve) => setTimeout(resolve, ms));
  return id === run;
}

async function play(from: number) {
  const id = ++run;
  tap.value = null;
  state.value = demoAt(from);
  for (let index = from; ; index = (index + 1) % demoSteps.length) {
    if (index === 0) state.value = initialDemo();
    step.value = index;
    for (const frame of demoSteps[index]!.frames) {
      if (frame.tap) {
        tap.value = frame.tap;
        if (!(await pause(TAP, id))) return;
      }
      frame.apply(state.value);
      tap.value = null;
      if (!(await pause(frame.hold, id))) return;
    }
  }
}

function choose(index: number) {
  if (!reducedMotion()) return play(index);
  run++;
  step.value = index;
  state.value = { ...demoAt(index + 1), toast: null };
}

/** Toasts fade like the app's, so they never cover what the demo taps next. */
let toastTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => state.value.toast,
  (toast) => {
    clearTimeout(toastTimer);
    if (toast) toastTimer = setTimeout(() => (state.value.toast = null), 2000);
  }
);

const tapped = (key: string) =>
  tap.value === key ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'ring-0 ring-transparent';

onMounted(() => {
  if (!reducedMotion()) play(0);
});
onBeforeUnmount(() => {
  run++;
  clearTimeout(toastTimer);
});
</script>

<template>
  <div
    ref="root"
    class="grid items-center gap-10 lg:grid-cols-[minmax(0,28rem)_minmax(0,24rem)] lg:justify-center lg:gap-16">
    <ol class="order-2 space-y-2 text-left lg:order-1">
      <li v-for="(entry, index) in demoSteps" :key="entry.title">
        <button
          type="button"
          class="group/step w-full text-left"
          :aria-current="step === index ? 'step' : undefined"
          @click="choose(index)">
          <span
            class="relative flex items-baseline gap-3 rounded-xl px-5 py-3 transition-colors"
            :class="
              step === index
                ? 'bg-primary/5'
                : 'text-muted-foreground group-hover/step:bg-muted/50 group-hover/step:text-foreground'
            ">
            <span
              class="absolute inset-y-3 left-0 w-1 rounded-full transition-colors"
              :class="step === index ? 'bg-primary' : 'bg-transparent'"
              aria-hidden="true"></span>
            <span class="text-sm font-semibold tabular-nums text-primary">{{ index + 1 }}</span>
            <span>
              <span class="block font-semibold" :class="step === index ? 'text-foreground' : ''">{{
                entry.title
              }}</span>
              <span class="mt-1 text-sm text-muted-foreground lg:block" :class="step === index ? 'block' : 'hidden'">{{
                entry.text
              }}</span>
            </span>
          </span>
        </button>
      </li>
    </ol>

    <div class="relative order-1 mx-auto w-full max-w-sm lg:order-2">
      <div
        class="demo-glow absolute -inset-x-6 top-10 h-3/4 rounded-full bg-primary/40 blur-3xl"
        aria-hidden="true"></div>
      <p class="sr-only">
        A live demo of the Fooderino app: using items at home, listing what runs out, shopping by store and unpacking
        the bag.
      </p>
      <div
        inert
        aria-hidden="true"
        class="relative flex h-[36rem] select-none flex-col overflow-hidden rounded-[2rem] border-[6px] border-foreground/10 bg-background text-left text-foreground shadow-2xl">
        <header class="shrink-0 space-y-1 border-b bg-background/90 px-3 pb-2 pt-3">
          <div class="flex items-center justify-between">
            <span
              class="bg-gradient-to-r from-red-600 to-amber-500 bg-clip-text text-lg font-extrabold tracking-tight text-transparent dark:from-orange-400 dark:to-amber-300"
              >FOODERINO<span class="text-primary">.</span></span
            >
            <span class="flex items-center text-muted-foreground">
              <span class="px-2 text-xs font-medium">Household</span>
              <span class="flex size-8 items-center justify-center"><Leaf class="size-4" /></span>
              <span class="flex size-8 items-center justify-center"><History class="size-4" /></span>
              <span class="flex size-8 items-center justify-center"><Settings class="size-4" /></span>
            </span>
          </div>
          <div class="grid grid-cols-3 gap-1 rounded-lg bg-muted p-0.5">
            <span
              v-for="entry in tabs"
              :key="entry.key"
              class="flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all"
              :class="[
                state.tab === entry.key ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground',
                tapped(`tab:${entry.key}`)
              ]"
              ><component :is="entry.icon" class="size-4 shrink-0" />{{ entry.name }}</span
            >
          </div>
        </header>

        <div class="relative min-h-0 flex-1 overflow-hidden">
          <Transition
            enter-active-class="transition duration-300 ease-out"
            enter-from-class="translate-x-4 opacity-0"
            leave-active-class="absolute inset-x-0 top-0 transition duration-200 ease-in"
            leave-to-class="-translate-x-4 opacity-0">
            <div v-if="state.tab === 'home'" key="home" class="space-y-3 p-3">
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-xl font-semibold tracking-tight">At home<span class="text-primary">.</span></span>
                <span class="text-xs tabular-nums text-muted-foreground">{{ homeCount }} items</span>
              </div>
              <section v-if="state.useSoon.length" class="space-y-1">
                <h3 class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Use soon</h3>
                <div
                  v-for="entry in state.useSoon"
                  :key="entry.item.id"
                  class="flex h-9 items-center gap-1 rounded-lg bg-orange-500/10 pl-2.5 pr-0.5 text-sm">
                  <span class="flex min-w-0 flex-1 items-center gap-2">
                    <span class="font-semibold">{{ entry.item.name }}</span
                    ><span class="text-[10px] font-medium text-orange-700 dark:text-orange-300">{{ entry.label }}</span>
                  </span>
                  <span
                    class="inline-flex h-7 items-center rounded px-2 text-xs font-medium text-primary transition-all"
                    :class="tapped(`soon:${entry.item.id}`)"
                    >Used it</span
                  ><span class="inline-flex h-7 items-center px-2 text-xs font-medium text-muted-foreground"
                    >Binned</span
                  >
                </div>
              </section>
              <section class="space-y-1">
                <h3 class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Quick picks</h3>
                <TransitionGroup
                  tag="div"
                  class="space-y-1"
                  enter-active-class="transition duration-500 ease-out"
                  enter-from-class="-translate-y-1 opacity-0">
                  <div
                    v-for="entry in state.home"
                    :key="entry.id"
                    class="rounded-lg transition-all"
                    :class="tapped(`home:${entry.id}`)">
                    <PantryRow :item="entry" />
                  </div>
                </TransitionGroup>
              </section>
            </div>

            <div v-else key="shop" class="space-y-3 p-3">
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-xl font-semibold tracking-tight">Shopping<span class="text-primary">.</span></span>
                <span class="text-xs tabular-nums text-muted-foreground">{{ shopCount }} to buy</span>
              </div>
              <section v-for="group in state.shop" :key="group.store" class="space-y-1">
                <h3 class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {{ group.store }}
                </h3>
                <TransitionGroup
                  tag="div"
                  class="space-y-1"
                  enter-active-class="transition duration-500 ease-out"
                  enter-from-class="-translate-y-1 bg-primary/20 opacity-0">
                  <div
                    v-for="entry in group.items"
                    :key="entry.id"
                    class="rounded-lg transition-all"
                    :class="tapped(`shop:${entry.id}`)">
                    <PantryRow :item="entry" shop>
                      <template #leading>
                        <span class="flex size-8 shrink-0 items-center justify-center text-muted-foreground"
                          ><X class="size-4"
                        /></span>
                      </template>
                    </PantryRow>
                  </div>
                </TransitionGroup>
              </section>
              <Transition
                enter-active-class="transition duration-300 ease-out"
                enter-from-class="translate-y-2 opacity-0">
                <section
                  v-if="state.bag.length"
                  class="space-y-1 rounded-xl bg-primary/5 p-2.5 ring-1 ring-inset ring-primary/10">
                  <h3 class="pb-1 text-xs font-semibold text-primary">In the bag ({{ state.bag.length }})</h3>
                  <div v-for="line in state.bag" :key="line.id" class="flex min-h-8 items-center gap-2 text-sm">
                    <span class="min-w-0 flex-1 truncate">{{ line.name }} · {{ line.to_buy }}</span
                    ><span class="px-2 text-xs font-medium text-muted-foreground">Remove</span>
                  </div>
                  <span
                    class="flex h-9 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition-all"
                    :class="tapped('unpack')"
                    >Unpack at home</span
                  >
                </section>
              </Transition>
            </div>
          </Transition>
        </div>

        <Transition
          enter-active-class="transition duration-300 ease-out"
          enter-from-class="translate-y-3 opacity-0"
          leave-active-class="transition duration-200 ease-in"
          leave-to-class="translate-y-3 opacity-0">
          <div
            v-if="state.toast"
            :key="state.toast.text"
            class="absolute inset-x-4 bottom-[4.5rem] flex items-center justify-between gap-2 rounded-lg border bg-background px-4 py-3 text-sm shadow-lg">
            <span class="font-medium">{{ state.toast.text }}</span>
            <span
              v-if="state.toast.from"
              class="flex size-6 items-center justify-center rounded-full bg-amber-500/20 text-xs font-semibold text-amber-700 dark:text-amber-300"
              >{{ state.toast.from[0] }}</span
            >
            <span v-else class="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">Undo</span>
          </div>
        </Transition>

        <div class="shrink-0 border-t bg-background/95 px-3 py-2">
          <div class="flex h-10 items-center gap-2 rounded-xl bg-muted/70 px-3 text-base text-muted-foreground">
            <Search class="size-4 text-primary" />{{
              state.tab === 'home' ? 'Find by name or tag…' : 'Add something to your list…'
            }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.demo-glow {
  animation: demo-glow 2s linear infinite alternate;
}

@keyframes demo-glow {
  from {
    opacity: 0.5;
    transform: translateY(30px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .demo-glow {
    animation: none;
  }
}
</style>
