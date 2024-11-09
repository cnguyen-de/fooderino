<script setup lang="ts">
import Navbar from '~/components/landing-page/Navbar.vue';
import Hero from '~/components/landing-page/Hero.vue';
import Sponsors from '~/components/landing-page/Sponsors.vue';
import Benefits from '~/components/landing-page/Benefits.vue';
import Features from '~/components/landing-page/Features.vue';
import Services from '~/components/landing-page/Services.vue';
import HowItWorks from '~/components/landing-page/HowItWorks.vue';
import Testimonials from '~/components/landing-page/Testimonials.vue';
import Team from '~/components/landing-page/Team.vue';
import Community from '~/components/landing-page/Community.vue';
import Pricing from '~/components/landing-page/Pricing.vue';
import Contact from '~/components/landing-page/Contact.vue';
import FAQ from '~/components/landing-page/FAQ.vue';
import Footer from '~/components/landing-page/Footer.vue';
const user = useSupabaseUser();
watchEffect(() => {
  if (user.value) {
    navigateTo('/inventory');
  }
});
</script>

<template>
  <NuxtLayout name="empty">
    <Navbar />
    <Hero />
    <Sponsors />
    <Benefits />
    <Features />
    <Services />
    <HowItWorks />
    <Testimonials />
    <Team />
    <Community />
    <Pricing />
    <Contact />
    <FAQ />
    <Footer />
  </NuxtLayout>
</template>
