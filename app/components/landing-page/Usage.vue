<script setup lang="ts">
import { Refrigerator, ShoppingCart, ShoppingBag, CookingPot } from 'lucide-vue-next';

const iconMap = {
  refrigerator: Refrigerator,
  shoppingCart: ShoppingCart,
  shoppingBag: ShoppingBag,
  cookingPot: CookingPot
};

interface BenefitsProps {
  icon: keyof typeof iconMap;
  title: string;
  description: string;
}

const benefitList: BenefitsProps[] = [
  {
    icon: 'refrigerator',
    title: 'Check what’s at home',
    description:
      'See stock grouped by place, from fridge to freezer. Check “Use soon” for items near their best-before date and find your most-used items in Quick picks.'
  },
  {
    icon: 'shoppingCart',
    title: 'Make your shopping list',
    description:
      'Keep your list grouped by store. Add suggestions based on your purchase rhythm or pick from items that ran out.'
  },
  {
    icon: 'shoppingBag',
    title: 'Pick up and unpack',
    description:
      'Tick off what you pick up to move it into your bag. Unpack into a storage place at home. Items with a shelf life get a best-before date.'
  },
  {
    icon: 'cookingPot',
    title: 'Cook and keep a history',
    description:
      'Save household recipes with ingredients linked to pantry items. Use Cook Today to record a dish and deduct its ingredients from stock. Look back at meals in cooking history.'
  }
];
</script>

<template>
  <section id="usage" class="container py-24 sm:py-32">
    <div class="grid place-items-center lg:grid-cols-2 lg:gap-24">
      <div>
        <h2 class="mb-2 text-lg tracking-wider text-primary">Everyday use</h2>

        <h2 class="mb-4 text-3xl font-bold md:text-4xl">How to use Fooderino</h2>
        <p class="mb-8 text-xl text-muted-foreground">
          From checking the fridge to cooking dinner, keep your pantry and shopping list in step.
        </p>
      </div>

      <div class="grid w-full gap-4 lg:grid-cols-2">
        <Card
          v-for="({ icon, title, description }, index) in benefitList"
          :key="title"
          class="group/number bg-muted/50 transition-all delay-75 hover:bg-background dark:bg-card dark:hover:bg-background">
          <CardHeader>
            <div class="flex justify-between">
              <component class="mb-6 size-8 text-primary" :is="iconMap[icon]" />

              <span
                class="text-5xl font-medium text-muted-foreground/15 transition-all delay-75 group-hover/number:text-muted-foreground/30"
                >0{{ index + 1 }}</span
              >
            </div>

            <CardTitle>{{ title }}</CardTitle>
          </CardHeader>

          <CardContent class="text-muted-foreground">
            {{ description }}
          </CardContent>
        </Card>
      </div>
    </div>
  </section>
</template>
