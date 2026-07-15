// Post-build prerender: inject the server-rendered page into dist/index.html.
// Runs after `vite build` (client) + `vite build --ssr` (see package.json).
import { readFileSync, writeFileSync, rmSync } from 'node:fs'

const PLACEHOLDER = '<div id="root"><!--app-html--></div>'
const { render } = await import('./dist-ssr/prerender.js')
const html = render()

const page = readFileSync('dist/index.html', 'utf8')
if (!page.includes(PLACEHOLDER)) {
  throw new Error('prerender: placeholder not found in dist/index.html')
}
writeFileSync('dist/index.html', page.replace(PLACEHOLDER, `<div id="root">${html}</div>`))
rmSync('dist-ssr', { recursive: true, force: true })
console.log(`prerendered index.html (+${(html.length / 1024).toFixed(0)} kB of markup)`)
