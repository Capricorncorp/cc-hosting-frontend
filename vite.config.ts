import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname)
  const profile = env.VITE_ACQUISITION_PROFILE || 'legacy'
  if (profile !== 'legacy' && profile !== 'moonshot') {
    throw new Error('VITE_ACQUISITION_PROFILE must be legacy or moonshot')
  }
  const moonshot = profile === 'moonshot'
  if (moonshot && (env.VITE_GATEWAY_URL !== 'https://gateway.moonshot-ai.in'
      || env.VITE_OIDC_URL !== 'https://auth.moonshot-ai.in')) {
    throw new Error('Moonshot acquisition requires its exact gateway and OIDC origins')
  }

  return {
    plugins: [
      react(),
      {
        name: 'acquisition-brand-profile',
        transformIndexHtml(html: string) {
          return moonshot ? html.replaceAll('Capricorncorp', 'Moonshot AI')
            .replace('/favicon.svg', '/brand/moonshot-symbol.svg') : html
        },
      },
    ],
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
  }
})
