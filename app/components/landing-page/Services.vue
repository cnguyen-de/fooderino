<script setup lang="ts">
enum ProService {
  YES = 1,
  NO = 0
}

interface ServiceProps {
  title: string;
  pro: ProService;
  description: string;
}

const serviceList: ServiceProps[] = [
  {
    title: 'Favorite Cuisines',
    description: 'Recipes are suggested based on your favorite cuisines.',
    pro: 0
  },
  {
    title: 'Allergies and Restrictions',
    description:
      'Your dietary restrictions and allergies are taken into account and recipes are suggested accordingly.',
    pro: 0
  },
  {
    title: 'Using only available ingredients',
    description:
      "Feeling hungry and don't know what to cook? Fooderino suggests recipes based on your available ingredients.",
    pro: 0
  },
  {
    title: 'Custom requests',
    description: 'You can request a custom recipe and Fooderino will generate a recipe based on your request.',
    pro: 1
  }
];
</script>

<template>
  <section id="recipes" class="container py-24 sm:py-32">
    <h2 class="mb-2 text-center text-lg tracking-wider text-primary">Recipes</h2>

    <h2 class="mb-4 text-center text-3xl font-bold md:text-4xl">Diversify your meals with GenAI Recipes</h2>
    <h3 class="mx-auto mb-8 text-center text-xl text-muted-foreground md:w-1/2">
      Recipe generation is powered by the latest GPT model with the knowledge of your preferences
    </h3>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"></div>

    <div class="mx-auto grid w-full gap-4 sm:grid-cols-2 lg:w-[60%] lg:grid-cols-2">
      <div v-for="{ title, description, pro } in serviceList" :key="title">
        <Card class="relative h-full bg-muted/60 dark:bg-card">
          <CardHeader>
            <CardTitle>{{ title }}</CardTitle>
            <CardDescription>{{ description }}</CardDescription>
          </CardHeader>
          <Badge v-if="pro === ProService.YES" variant="secondary" class="absolute -right-3 -top-2">PRO</Badge>
        </Card>
      </div>
    </div>
  </section>
</template>
