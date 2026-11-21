<script setup lang="ts">
import { Marquee } from '@selemondev/vue3-marquee';
import '@selemondev/vue3-marquee/dist/style.css';
import { Layers, Code, Database, Cloud, Paintbrush, Blocks } from 'lucide-vue-next';

const iconMap = {
  layers: Layers,
  code: Code,
  database: Database,
  cloud: Cloud,
  paintbrush: Paintbrush,
  blocks: Blocks
};

interface StackProps {
  icon: keyof typeof iconMap;
  name: string;
}

const stacks: StackProps[] = [
  { icon: 'layers', name: 'Nuxt' },
  { icon: 'code', name: 'Vue' },
  { icon: 'database', name: 'Dexie / IndexedDB' },
  { icon: 'cloud', name: 'Supabase' },
  { icon: 'paintbrush', name: 'Tailwind CSS' },
  { icon: 'blocks', name: 'shadcn-vue' }
];
</script>

<template>
  <section id="techstack" class="mx-auto max-w-[75%] pb-24 sm:pb-32">
    <h2 class="mb-6 text-center text-lg md:text-xl">Built with</h2>

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
