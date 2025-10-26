import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(),
  VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'JudgeSync',
      description: 'Real-time collaboration for VEX Robotics judges',
      short_name: 'JudgeSync',
      theme_color: '#ffffff',
      background_color: '#434750',
      start_url: '/',
      display: 'standalone',
      icons: [
        {
          src: 'assets/gear_icon_192_transparent.png',
        }
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/api\.robotevents\.com\/.*/i,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'robotevents-api',
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 // 1 hour
            },
            cacheableResponse: {
              statuses: [0, 200]
            }
          }
        }
      ]
    }
  })
  ],
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: true,
  },
  base: '/',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: '../dist/frontend',
    emptyOutDir: true,
  },

})
