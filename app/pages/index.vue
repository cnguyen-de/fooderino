<script setup lang="ts">
import Navbar from '~/components/landing-page/Navbar.vue';
import Hero from '~/components/landing-page/Hero.vue';
import Techstack from '~/components/landing-page/Techstack.vue';
import Usage from '~/components/landing-page/Usage.vue';
import Features from '~/components/landing-page/Features.vue';
import Contact from '~/components/landing-page/Contact.vue';
import Footer from '~/components/landing-page/Footer.vue';

useSeoMeta({
  title: 'Fooderino | Pantry, shopping and recipes',
  description:
    'Share a pantry, shop by store and cook household recipes. Fooderino works offline, syncs changes and shows what’s in season in Germany.'
});
</script>

<template>
  <NuxtLayout name="empty">
    <Navbar />
    <Hero />
    <Features />
    <Usage />
    <Techstack />
    <Contact />
    <Footer />
  </NuxtLayout>
</template>
