import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Static marketing site: `npm run build` builds the client bundle, then an SSR
// pass (src/prerender.tsx + prerender.mjs) bakes the rendered page into
// dist/index.html so any static host (nginx) serves real HTML.
export default defineConfig({
  plugins: [tailwindcss(), viteReact()],
})
