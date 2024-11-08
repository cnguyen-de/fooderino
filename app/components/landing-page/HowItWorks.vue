<script setup lang="ts">
interface HowItWorksProps {
  badgeTitle: string;
  title: string;
  description: string;
  image: string;
}

const HowItWorksList: HowItWorksProps[] = [
  {
    badgeTitle: 'Contribute',
    title: 'Make a Difference with Every Contribution',
    description:
      'Lorem ipsum dolor, sit amet consectetur adipisicing elit. Voluptatem fugiat, quasi sint reiciendis quidem iure.',
    image: 'roboto.png'
  },
  {
    badgeTitle: 'Discover',
    title: 'Create an Impact with Every Choice',
    description:
      'Lorem ipsum dolor, sit amet consectetur adipisicing elit. Voluptatem fugiat, sint reiciendis quidem iure veritatis optio facere tenetur.',
    image: 'runner.png'
  },
  {
    badgeTitle: 'Innovate',
    title: 'Make Every Action Count',
    description:
      'Lorem ipsum dolor, sit amet consectetur adipisicing elit. Voluptatem fugiat, odit similique quasi sint.',
    image: 'pacheco.png'
  },
  {
    badgeTitle: 'Collaborate',
    title: 'Tackle this challenge together',
    description:
      'Lorem ipsum dolor, sit amet consectetur adipisicing elit. Voluptatem fugiat, quasi sint reiciendis quidem iure.',
    image: 'gamestation.png'
  }
];
</script>

<template>
  <section id="features" class="container py-24 sm:py-32">
    <div class="mb-8 text-center">
      <h2 class="mb-2 text-center text-lg tracking-wider text-primary">How It Works</h2>

      <h2 class="text-center text-3xl font-bold md:text-4xl">Step-by-Step Process</h2>
    </div>

    <div class="relative mx-auto lg:w-[80%]">
      <div
        v-for="({ badgeTitle, title, description, image }, index) in HowItWorksList"
        :key="title"
        :class="['mb-8 flex items-center', { 'flex-row-reverse': index % 2 !== 0 }]">
        <Card class="h-full border-0 bg-transparent shadow-none">
          <CardHeader>
            <div class="pb-4">
              <Badge>{{ badgeTitle }}</Badge>
            </div>

            <CardTitle>
              {{ title }}
            </CardTitle>
          </CardHeader>

          <CardContent class="w-[80%] text-muted-foreground">
            {{ description }}
          </CardContent>
        </Card>

        <img
          :src="image"
          :alt="`Image describing ${title} `"
          className="w-[150px]  md:w-[250px] lg:w-[300px] mx-auto -scale-x-100 " />
        <div
          :class="[
            'absolute right-0 -z-10 h-72 w-44 rounded-full bg-primary/15 blur-3xl dark:bg-primary/10 lg:h-80 lg:w-64',
            {
              'left-0': index % 2 !== 0
            }
          ]"></div>
      </div>
    </div>
  </section>
</template>
