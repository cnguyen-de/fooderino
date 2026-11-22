<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next';
import AppDemo from '~/components/landing-page/AppDemo.vue';
</script>

<template>
  <section id="hero" class="container">
    <div class="mx-auto grid place-items-center gap-8 py-20 md:py-32 lg:max-w-screen-xl">
      <div class="space-y-8 text-center">
        <Badge variant="outline" class="rounded-full py-2 text-sm">
          <span class="mr-2 text-primary">
            <Badge>New</Badge>
          </span>
          <span>Seasons: what’s in season in Germany</span>
        </Badge>

        <div class="mx-auto text-center text-4xl font-bold sm:text-5xl md:text-6xl">
          <h1>Your pantry, shopping and recipes, together</h1>
        </div>

        <p class="mx-auto max-w-screen-sm text-xl text-muted-foreground">
          See what’s at home, shop for what you need and cook from your household’s recipes. Works offline and syncs
          when you’re back online.
        </p>

        <div class="space-y-4 md:space-x-4 md:space-y-0">
          <NuxtLink class="group/arrow w-5/6 font-bold md:w-1/4" to="/login">
            <Button variant="outline" class="bg-white hover:bg-gray-300">
              <span
                class="bg-gradient-to-r from-red-600 to-yellow-500 bg-clip-text font-bold tracking-wide text-transparent">
                Open Fooderino
              </span>
              <ArrowRight
                class="text ml-2 size-5 animate-pulse text-yellow-600 transition-transform group-hover/arrow:translate-x-1" />
            </Button>
          </NuxtLink>
        </div>
      </div>

      <AppDemo class="mt-8 w-full" />
    </div>
  </section>
</template>
