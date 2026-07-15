import { createRoot, hydrateRoot } from 'react-dom/client'
import { App } from './App'
import './styles/globals.css'

// Production HTML is prerendered (see prerender.mjs) — hydrate it. The dev
// server serves the raw index.html (root holds only the placeholder comment),
// so render from scratch there.
const root = document.getElementById('root')!
if (root.firstElementChild) hydrateRoot(root, <App />)
else createRoot(root).render(<App />)
