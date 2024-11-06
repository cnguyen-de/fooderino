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
    '@vee-validate/nuxt',
    '@pinia/nuxt'
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
    openaiApiKey: process.env.OPENAI_API_KEY,
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
    { path: '~/components/action-bar', pathPrefix: false },
    { path: '~/components/footer', pathPrefix: false },
    { path: '~/components/header', pathPrefix: false },
    { path: '~/components/items', pathPrefix: false },
    { path: '~/components/lists', pathPrefix: false }
  ],
  //Work around dev tools error
  vite: {
    optimizeDeps: {
      exclude: ['vee-validate']
    }
  },
  pwa: {
    manifest: {
      name: 'Fooderino',
      short_name: 'Fooderino',
      description: 'Fooderino is a AI powered recipe and check list app for groceries.',
      theme_color: '#000000',
      background_color: '#170206',
      lang: 'en',
      icons: [
        {
          src: '/android-icon-36x36.png',
          sizes: '36x36',
          type: 'image/png',
          density: '0.75'
        },
        {
          src: '/android-icon-48x48.png',
          sizes: '48x48',
          type: 'image/png',
          density: '1.0'
        },
        {
          src: '/android-icon-72x72.png',
          sizes: '72x72',
          type: 'image/png',
          density: '1.5'
        },
        {
          src: '/android-icon-96x96.png',
          sizes: '96x96',
          type: 'image/png',
          density: '2.0'
        },
        {
          src: '/android-icon-144x144.png',
          sizes: '144x144',
          type: 'image/png',
          density: '3.0'
        },
        {
          src: '/android-icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          density: '4.0'
        }
      ],
      screenshots: [
        {
          src: '/screenshot-handset.png',
          sizes: '1082x2402',
          type: 'image/png',
          form_factor: 'narrow'
        },
        {
          src: '/screenshot-wide.png',
          sizes: '3840x2160',
          type: 'image/png',
          form_factor: 'wide'
        }
      ]
    },
    devOptions: {
      enabled: true,
      type: 'module'
    }
  }
});
