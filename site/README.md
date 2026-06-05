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
npm run build      # prerenders the page to static files in dist/client/
npm run preview    # preview the production build locally
```

The route is prerendered to plain HTML + assets in `dist/client/`, so this is a
fully static site, no Node server at runtime.

## Deploy (Docker / Coolify)

A `Dockerfile` builds the site and serves `dist/client/` with nginx. In Coolify:

- Build Pack: **Dockerfile**
- Base Directory: **/site**
- Dockerfile: **./Dockerfile**
- Port (Ports Exposes): **3000** — must match the container's listen port (nginx
  listens on 3000, which is Coolify's default). A mismatch shows as "Bad Gateway".

Or build it anywhere:

```bash
docker build -t queuepop-site ./site
docker run -p 8080:3000 queuepop-site   # http://localhost:8080
```

Any static host also works, just upload `dist/client/`.

## Things to wire up before launch

- **Donate URL**, `src/data/content.ts` → `LINKS.donate` (Ko-fi / GitHub Sponsors).
- Confirm the **download/GitHub** links in `src/data/content.ts` (point at the
  `queuePop` repo, which must exist + have a release for the download to resolve).

## Structure

- `src/routes/`, `__root.tsx` (document shell + head) and `index.tsx` (page).
- `src/components/`, section components + `PlayEmblem` (recreated from
  `../../design/play-button.svg`) and the `icons.tsx` original icon set.
- `src/styles/globals.css`, Tailwind v4 `@theme` tokens + ported `.hextech` /
  `.framed` / keyframe utilities. Fonts in `public/fonts/`.

> queuePop is an unofficial, fan-made tool. Not endorsed by, affiliated with, or
> sponsored by Riot Games. League of Legends and Riot Games are trademarks of
> Riot Games, Inc.
