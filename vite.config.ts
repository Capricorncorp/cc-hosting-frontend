import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  // Phase 3b/4a — direct alias to the installed npm package's dist/.
  // Mirrors tsconfig.app.json paths so Vite's runtime resolution
  // matches TS at build time.
  resolve: {
    alias: {
      '@capricorncorp/frontend-platform': path.resolve(__dirname, 'node_modules/@capricorncorp/frontend-platform/dist'),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
  },
})
