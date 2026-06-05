# queuePop, marketing site

Single-page marketing site for queuePop, built with **Vite + TanStack Start**
(React + TypeScript) and **Tailwind CSS v4**. It mirrors the app's Hextech visual
identity (gold/teal palette, Cinzel/Marcellus type) using only license-clean
assets, **no Riot Games artwork or trademarks** appear on the site.

## Develop

```bash
cd site
npm install
npm run dev        # http://localhost:3000
```

## Build

```bash
npm run build      # outputs .output/ (Nitro server), deploy to Vercel / Netlify
npm run start      # run the production build locally
```

TanStack Start prerenders the single route, so it also drops cleanly onto static
hosts. Deploy targets: Vercel or Netlify (zero-config), or static export for
GitHub Pages.

## Things to wire up before launch

- **Donate URL**, `src/data/content.ts` → `LINKS.donate` (Ko-fi / GitHub Sponsors).
- **OG image**, drop a `public/og-image.png` and reference it in `src/routes/__root.tsx`.
- Confirm the **download/GitHub** links in `src/data/content.ts`.

## Structure

- `src/routes/`, `__root.tsx` (document shell + head) and `index.tsx` (page).
- `src/components/`, section components + `PlayEmblem` (recreated from
  `../../design/play-button.svg`) and the `icons.tsx` original icon set.
- `src/styles/globals.css`, Tailwind v4 `@theme` tokens + ported `.hextech` /
  `.framed` / keyframe utilities. Fonts in `public/fonts/`.

> queuePop is an unofficial, fan-made tool. Not endorsed by, affiliated with, or
> sponsored by Riot Games. League of Legends and Riot Games are trademarks of
> Riot Games, Inc.
