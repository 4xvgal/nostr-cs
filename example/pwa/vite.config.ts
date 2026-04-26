import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import { SvelteKitPWA } from '@vite-pwa/sveltekit'

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'CSClient — Nostr Support',
        short_name: 'CSClient',
        description: 'Customer support over Nostr',
        theme_color: '#0d631b',
        background_color: '#f9f9f9',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['client/**/*.{js,css,html,svg,png,ico,webp}'],
        navigateFallback: '/',
      },
      devOptions: { enabled: false },
    }),
  ],
  optimizeDeps: {
    exclude: ['nostr-cs'],
  },
  server: {
    fs: {
      allow: ['..', '../..'],
    },
  },
})
