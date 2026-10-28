import { fileURLToPath } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import Vuetify from 'vite-plugin-vuetify'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [Vue(), Vuetify({ autoImport: true, styles: 'none' })],
  // jsdom checks behavior; responsive styles are checked in the browser.
  cacheDir: 'node_modules/.vite-component-tests',
  resolve: { alias: { '@': fileURLToPath(new URL('src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    include: ['tests/components/**/*.spec.ts'],
    setupFiles: ['tests/components/setup.ts'],
    server: { deps: { inline: ['vuetify'] } },
  },
})
