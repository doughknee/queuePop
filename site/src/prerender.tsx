// SSR entry used only at build time (see prerender.mjs): renders the page to
// static HTML so the marketing copy ships in index.html, no JS required.
import { renderToString } from 'react-dom/server'
import { App } from './App'

export function render() {
  return renderToString(<App />)
}
