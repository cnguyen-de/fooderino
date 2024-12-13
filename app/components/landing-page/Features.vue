<script setup lang="ts">
import {
  Paintbrush,
  MessageCircle,
  TabletSmartphone,
  BadgeCheck,
  Goal,
  Brain,
  MousePointerClick,
  Newspaper
} from 'lucide-vue-next';

interface FeaturesProps {
  icon: string;
  title: string;
  description: string;
}

const featureList: FeaturesProps[] = [
  {
    icon: 'tabletSmartphone',
    title: 'Mobile First',
    description: 'Fooderino is designed with mobile first approach, while still looking great on desktops.'
  },
  {
    icon: 'badgeCheck',
    title: 'Easy to Use',
    description: 'Inventory management is boring, so we made it as easy as possible to use.'
  },
  {
    icon: 'goal',
    title: 'Nutrition Goals',
    description: 'Recipes are suggested based on your nutrition goals and dietary restrictions.'
  },
  {
    icon: 'brain',
    title: 'GenAI',
    description:
      'Our recipes include not only classic dishes but also AI-powered suggestions based on your available ingredients.'
  },
  {
    icon: 'mousePointerClick',
    title: 'Recurring Purchase',
    description: 'Subscriptions and Items can be automatically added to your shopping list.'
  }
];

const iconMap = {
  tabletSmartphone: TabletSmartphone,
  badgeCheck: BadgeCheck,
  goal: Goal,
  brain: Brain,
  paintbrush: Paintbrush,
  mousePointerClick: MousePointerClick,
  messageCircle: MessageCircle,
  newspaper: Newspaper
};
</script>

<template>
  <section id="features" class="container py-24 sm:py-32">
    <h2 class="mb-2 text-center text-lg tracking-wider text-primary">Features</h2>

    <h2 class="mb-4 text-center text-3xl font-bold md:text-4xl">What Makes Us Different</h2>

    <h3 class="mx-auto mb-8 text-center text-xl text-muted-foreground md:w-1/2">
      Fooderino is designed to make your life easier. Here are some of the features that make us different.
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
