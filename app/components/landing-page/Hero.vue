<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next';
import { useMediaQuery } from '@vueuse/core';

const isLargeScreen = useMediaQuery('(min-width: 1024px)');
</script>

<template>
  <section class="container">
    <div class="mx-auto grid place-items-center gap-8 py-20 md:py-32 lg:max-w-screen-xl">
      <div class="space-y-8 text-center">
        <Badge variant="outline" class="rounded-full py-2 text-sm">
          <span class="mr-2 text-primary">
            <Badge>New</Badge>
          </span>
          <span>BETA Release</span>
        </Badge>

        <div class="mx-auto text-center text-4xl font-bold sm:text-5xl md:text-6xl">
          <h1>Smart Recipes, Smarter Shopping</h1>
        </div>

        <p class="mx-auto max-w-screen-sm text-xl text-muted-foreground">
          Your mobile-first PWA app for groceries, inventory tracking, and recipe ideas.
        </p>

        <div class="space-y-4 md:space-x-4 md:space-y-0">
          <NuxtLink class="group/arrow w-5/6 font-bold md:w-1/4" to="/login">
            <Button variant="outline" class="bg-white hover:bg-gray-300">
              <span
                class="bg-gradient-to-r from-red-600 to-yellow-500 bg-clip-text font-bold tracking-wide text-transparent">
                Let's Get Cooking!
              </span>
              <ArrowRight
                class="text ml-2 size-5 animate-pulse text-yellow-600 transition-transform group-hover/arrow:translate-x-1" />
            </Button>
          </NuxtLink>

          <!--
              <Button as-child variant="secondary" class="w-5/6 font-bold md:w-1/4">
            <a href="https://github.com/leoMirandaa/shadcn-vue-landing-page.git" target="_blank">Pro </a>
          </Button>
          -->
        </div>
      </div>

      <div class="group relative mt-14">
        <!-- gradient shadow -->
        <div
          class="img-shadow-animation absolute -top-6 right-12 h-12 w-[90%] rounded-full bg-primary/50 blur-3xl lg:h-[80%]"></div>

        <Carousel class="mx-8" :opts="{ loop: true }">
          <CarouselContent class="-ml-4">
            <CarouselItem class="pl-4">
              <img
                class="img-border-animation relative mx-auto flex w-full cursor-grab items-center rounded-lg border border-t-2 border-t-primary/30 object-contain leading-none md:w-[1200px]"
                :src="isLargeScreen ? '/hero-inventory-desktop.png' : '/hero-inventory-mobile.png'"
                alt="Fooderino Screenshot Inventory" />
            </CarouselItem>
            <CarouselItem class="pl-4">
              <img
                class="img-border-animation relative mx-auto flex w-full cursor-grab items-center rounded-lg border border-t-2 border-t-primary/30 object-contain leading-none md:w-[1200px]"
                :src="isLargeScreen ? '/hero-ai-desktop.png' : '/hero-ai-mobile.png'"
                alt="Fooderino Screenshot AI" />
            </CarouselItem>
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
        <!-- gradient effect img -->
        <div
          class="absolute bottom-0 left-0 h-20 w-full rounded-lg bg-gradient-to-b from-background/0 via-background/50 to-background md:h-28"></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.img-shadow-animation {
  animation-name: img-shadow-animation;
  animation-iteration-count: infinite;
  animation-duration: 2s;
  animation-timing-function: linear;
  animation-direction: alternate;
}

.img-border-animation {
  animation-name: img-border-animation;
  animation-iteration-count: infinite;
  animation-duration: 2s;
  animation-timing-function: linear;
  animation-direction: alternate;
}

@keyframes img-shadow-animation {
  from {
    opacity: 0.5;
    transform: translateY(30px);
  }

  to {
    opacity: 1;
    transform: translateY(0px);
  }
}
@keyframes img-border-animation {
  from {
    @apply border-t-primary/10;
  }

  to {
    @apply border-t-primary/60;
  }
}
</style>
