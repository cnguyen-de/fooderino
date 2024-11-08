<script setup lang="ts">
import { ChevronsDown } from 'lucide-vue-next';
</script>

<template>
  <footer id="footer" class="container py-24 pb-16 sm:py-32 sm:pb-24">
    <div class="rounded-2xl border bg-muted/50 p-10 dark:bg-card">
      <div class="grid grid-cols-2 gap-x-12 gap-y-8 md:grid-cols-4 xl:grid-cols-6">
        <div class="col-span-full xl:col-span-2">
          <a href="#" class="flex items-center font-bold">
            <ChevronsDown
              class="mr-2 h-9 w-9 rounded-lg border bg-gradient-to-tr from-primary via-primary/70 to-primary text-white" />

            <h3 class="text-2xl">Shadcn-Vue</h3>
          </a>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-lg font-bold">Contact</h3>
          <div>
            <a href="#" class="opacity-60 hover:opacity-100"> Github </a>
          </div>

          <div>
            <a href="#" class="opacity-60 hover:opacity-100"> Twitter </a>
          </div>

          <div>
            <a href="#" class="opacity-60 hover:opacity-100"> Instagram </a>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-lg font-bold">Platforms</h3>
          <div>
            <a href="#" class="opacity-60 hover:opacity-100"> iOS </a>
          </div>

          <div>
            <a href="#" class="opacity-60 hover:opacity-100"> Android </a>
          </div>

          <div>
            <a href="#" class="opacity-60 hover:opacity-100"> Web </a>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-lg font-bold">Help</h3>
          <div>
            <a href="#" class="opacity-60 hover:opacity-100"> Contact Us </a>
          </div>

          <div>
            <a href="#" class="opacity-60 hover:opacity-100"> FAQ </a>
          </div>

          <div>
            <a href="#" class="opacity-60 hover:opacity-100"> Feedback </a>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-lg font-bold">Socials</h3>
          <div>
            <a href="#" class="opacity-60 hover:opacity-100"> Twitch </a>
          </div>

          <div>
            <a href="#" class="opacity-60 hover:opacity-100"> Discord </a>
          </div>

          <div>
            <a href="#" class="opacity-60 hover:opacity-100"> Dribbble </a>
          </div>
        </div>
      </div>

      <Separator class="my-6" />
      <section className="">
        <h3 class="">
          &copy; 2024 Designed and developed by
          <a
            target="_blank"
            href="https://github.com/leoMirandaa"
            className="text-primary transition-all border-primary hover:border-b-2">
            Leo Miranda
          </a>
        </h3>
      </section>
    </div>
  </footer>
</template>
