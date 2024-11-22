<script setup lang="ts">
import { Marquee } from '@selemondev/vue3-marquee';
import '@selemondev/vue3-marquee/dist/style.css';

import { Crown, Vegan, Ghost, Puzzle, Squirrel, Cookie, Drama, CreditCard } from 'lucide-vue-next';

interface sponsorsProps {
  icon: string;
  name: string;
}

const stacks: sponsorsProps[] = [
  {
    icon: 'crown',
    name: 'Vue'
  },
  {
    icon: 'vegan',
    name: 'Nuxt'
  },
  {
    icon: 'ghost',
    name: 'Supabase'
  },
  {
    icon: 'puzzle',
    name: 'Github Auth'
  },
  {
    icon: 'squirrel',
    name: 'Google Auth'
  },
  {
    icon: 'cookie',
    name: 'Vercel'
  },
  {
    icon: 'drama',
    name: 'TailwindCSS'
  },
  {
    icon: 'crown',
    name: 'Shadcn UI'
  },
  {
    icon: 'creditcard',
    name: 'Stripe'
  }
];

const iconMap: Record<
  string,
  typeof Crown | typeof Vegan | typeof Ghost | typeof Puzzle | typeof Squirrel | typeof Cookie | typeof Drama
> = {
  crown: Crown,
  vegan: Vegan,
  ghost: Ghost,
  puzzle: Puzzle,
  squirrel: Squirrel,
  cookie: Cookie,
  drama: Drama,
  creditcard: CreditCard
};
</script>

<template>
  <section id="techstack" class="mx-auto max-w-[75%] pb-24 sm:pb-32">
    <h2 class="mb-6 text-center text-lg md:text-xl">Our Techstacks</h2>

    <div class="mx-auto">
      <Marquee class="gap-[3rem]" :pauseOnHover="true" :fade="true" innerClassName="gap-[3rem]">
        <div v-for="{ icon, name } in stacks" :key="name">
          <div class="flex items-center whitespace-nowrap text-xl font-medium md:text-2xl">
            <component :is="iconMap[icon]" class="mr-2" stroke-width="3" />
            {{ name }}
          </div>
        </div>
      </Marquee>
    </div>
  </section>
</template>
