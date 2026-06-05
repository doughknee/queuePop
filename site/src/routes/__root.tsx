import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import appCss from '../styles/globals.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'queuePop: Your League queue, on autopilot' },
      {
        name: 'description',
        content:
          'queuePop auto-accepts your League of Legends and TFT queue, hovers and locks your picks, manages per-champion loadouts, and pings your phone the moment a match is ready. Free, open source, Windows.',
      },
      { name: 'theme-color', content: '#0A1428' },
      { property: 'og:title', content: 'queuePop: Your League queue, on autopilot' },
      {
        property: 'og:description',
        content:
          'Free, fan-made companion for League of Legends & TFT. Auto-accept, auto pick/ban, per-champ loadouts, and phone alerts.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: '/og-image.png' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: '/og-image.png' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
      { rel: 'apple-touch-icon', href: '/favicon-512.png' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
