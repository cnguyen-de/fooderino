<script setup lang="ts">
import { Users, WifiOff, Leaf, History, Search, FileJson } from 'lucide-vue-next';

const iconMap = {
  users: Users,
  wifiOff: WifiOff,
  leaf: Leaf,
  history: History,
  search: Search,
  fileJson: FileJson
};

interface FeaturesProps {
  icon: keyof typeof iconMap;
  title: string;
  description: string;
}

const featureList: FeaturesProps[] = [
  {
    icon: 'users',
    title: 'One household pantry',
    description:
      'Share your pantry, shopping list and recipes. Join by QR code and see each other’s changes live when online.'
  },
  {
    icon: 'wifiOff',
    title: 'Works offline',
    description: 'Every tap updates your device at once, even offline. Changes sync when you are back online.'
  },
  {
    icon: 'leaf',
    title: 'Seasons',
    description:
      'See which fruits and vegetables are in season in Germany this month and what’s coming next. In-season items come first in shopping suggestions.'
  },
  {
    icon: 'history',
    title: 'See who changed what',
    description: 'Check household activity or the history of one item, including changes waiting to sync.'
  },
  {
    icon: 'search',
    title: 'Find items by any name',
    description: 'Give items alternate names and search by any of them. Search matches with or without accents.'
  },
  {
    icon: 'fileJson',
    title: 'Export and import',
    description: 'Export your household’s items and recipes as JSON, or import them from a Fooderino export in Settings.'
  }
];
</script>

<template>
  <section id="features" class="container py-24 sm:py-32">
    <h2 class="mb-2 text-center text-lg tracking-wider text-primary">Features</h2>

    <h2 class="mb-4 text-center text-3xl font-bold md:text-4xl">Keep your household up to date</h2>

    <h3 class="mx-auto mb-8 text-center text-xl text-muted-foreground md:w-1/2">
      Keep track of what you have, what you need and what you cook, together.
    </h3>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="{ icon, title, description } in featureList" :key="title">
        <Card class="h-full border-0 bg-background shadow-none">
          <CardHeader class="flex items-center justify-center">
            <div class="mb-4 rounded-full bg-primary/20 p-2 ring-8 ring-primary/10">
              <component :is="iconMap[icon]" class="size-6 text-primary" />
            </div>

            <CardTitle>
              {{ title }}
            </CardTitle>
          </CardHeader>

          <CardContent class="text-center text-muted-foreground">
            {{ description }}
          </CardContent>
        </Card>
      </div>
    </div>
  </section>
</template>

<style lang="less" scoped></style>
