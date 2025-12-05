// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  ssr: false,
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
    viewTransition: true,
    payloadExtraction: false,
    renderJsonPayloads: false
  },
  router: {
    options: {
      hashMode: false,
      scrollBehaviorType: 'smooth'
    }
  },
  app: {
    head: {
      viewport: 'width=device-width, initial-scale=1, maximum-scale=5',
      charset: 'utf-8',
      meta: [{ name: 'format-detection', content: 'telephone=no' }]
    }
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
    { path: '~/components/lists', pathPrefix: false },
    { path: '~/components/recipes', pathPrefix: false },
    { path: '~/components/logs', pathPrefix: false }
  ],
  //Work around dev tools error
  vite: {
    optimizeDeps: {
      exclude: ['vee-validate']
    }
  },
  pwa: {
    registerType: 'autoUpdate',
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
          type: 'image/png'
        },
        {
          src: '/android-icon-48x48.png',
          sizes: '48x48',
          type: 'image/png'
        },
        {
          src: '/android-icon-72x72.png',
          sizes: '72x72',
          type: 'image/png'
        },
        {
          src: '/android-icon-96x96.png',
          sizes: '96x96',
          type: 'image/png'
        },
        {
          src: '/android-icon-144x144.png',
          sizes: '144x144',
          type: 'image/png'
        },
        {
          src: '/android-icon-192x192.png',
          sizes: '192x192',
          type: 'image/png'
        }
      ],
      screenshots: [
        {
          src: '/screenshot-handset.jpg',
          sizes: '1082x2402',
          type: 'image/png',
          form_factor: 'narrow'
        },
        {
          src: '/screenshot-wide.jpg',
          sizes: '3840x2160',
          type: 'image/png',
          form_factor: 'wide'
        }
      ]
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,ico,svg,webp,woff,woff2}'],
      globIgnores: ['**/node_modules/**', '**/emojis/**', '**/hero-*.png', '**/screenshot-*.jpg'],
      maximumFileSizeToCacheInBytes: 3000000,
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'supabase-cache',
            expiration: {
              maxEntries: 50,
              maxAgeSeconds: 60 * 5 // 5 minutes
            },
            networkTimeoutSeconds: 10
          }
        },
        {
          urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'google-fonts-cache',
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
            }
          }
        },
        {
          urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'image-cache',
            expiration: {
              maxEntries: 100,
              maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
            }
          }
        }
      ]
    },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,ico,svg}'],
      globIgnores: ['emojis/**', 'manifest**.webmanifest', '**/*.map', 'hero-*.png', 'screenshot-*.jpg']
    },
    devOptions: {
      enabled: true,
      type: 'module'
    },
    client: {
      installPrompt: true,
      periodicSyncForUpdates: 3600
    }
  }
});
