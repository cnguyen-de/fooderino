// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  modules: [
    '@nuxtjs/tailwindcss',
    '@vite-pwa/nuxt',
    '@nuxtjs/supabase',
    'shadcn-nuxt',
    '@nuxtjs/color-mode',
    '@vee-validate/nuxt'
  ],
  css: ['./assets/css/tailwind.css'],
  shadcn: { prefix: '', componentDir: './app/components/ui' },
  future: {
    compatibilityVersion: 4
  },
  experimental: {
    viewTransition: true
  },
  runtimeConfig: {
    public: {
      baseUrl: process.env.BASE_URL || 'http://localhost:3000'
    }
  },
  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: ['/']
    }
  },
  components: [
    { path: '~/components/footer', pathPrefix: false },
    { path: '~/components/header', pathPrefix: false },
    { path: '~/components/items', pathPrefix: false }
  ],
  //Work around dev tools error
  vite: {
    optimizeDeps: {
      exclude: ['vee-validate']
    }
  }
});
