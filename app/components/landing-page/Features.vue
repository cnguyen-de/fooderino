<script setup lang="ts">
import {
  Paintbrush,
  MessageCircle,
  TabletSmartphone,
  BadgeCheck,
  Goal,
  PictureInPicture,
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
    title: 'Mobile Friendly',
    description: 'Lorem ipsum dolor sit amet consectetur adipisicing elit. A odio velit cum aliquam, consectetur.'
  },
  {
    icon: 'badgeCheck',
    title: 'Social Proof',
    description: 'Lorem ipsum dolor sit amet consectetur. Natus consectetur, odio ea accusamus aperiam.'
  },
  {
    icon: 'goal',
    title: 'Targeted Content',
    description: 'Lorem ipsum dolor sit amet consectetur adipisicing elit. odio ea accusamus aperiam.'
  },
  {
    icon: 'pictureInPicture',
    title: 'Strong Visuals',
    description: 'Lorem elit. A odio velit cum aliquam. Natus consectetur dolores, odio ea accusamus aperiam.'
  },
  {
    icon: 'mousePointerClick',
    title: 'Clear CTA',
    description: 'Lorem ipsum dolor sit amet consectetur adipisicing. odio ea accusamus consectetur.'
  },
  {
    icon: 'newspaper',
    title: 'Clear Headline',
    description: 'Lorem ipsum dolor sit amet consectetur adipisicing elit. A odio velit cum aliquam. Natus consectetur.'
  }
];

const iconMap: Record<
  string,
  | typeof TabletSmartphone
  | typeof BadgeCheck
  | typeof Goal
  | typeof PictureInPicture
  | typeof Paintbrush
  | typeof MousePointerClick
  | typeof MessageCircle
  | typeof Newspaper
> = {
  tabletSmartphone: TabletSmartphone,
  badgeCheck: BadgeCheck,
  goal: Goal,
  pictureInPicture: PictureInPicture,
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
      Lorem ipsum dolor, sit amet consectetur adipisicing elit. Voluptatem fugiat, odit similique quasi sint reiciendis
      quidem iure veritatis optio facere tenetur.
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
