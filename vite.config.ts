import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import url from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': url.fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/scryfall': {
        target: 'https://cards.scryfall.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/scryfall/, ''),
      },
      // Stable Diffusion local API proxy to avoid browser CORS issues
      '/sd': {
        target: 'http://127.0.0.1:7860',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sd/, ''),
      },
    },
  },
})
