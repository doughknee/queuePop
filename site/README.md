# queuePop, public site

One page for the queuePop Overwolf build (the store edition, `app/edition.js`): what it does, that it plays fair, where to
get it, plus `terms.html` and `privacy.html`. Vite + React, prerendered to static HTML at build time, so it needs no
JavaScript to read and no server beyond static files.

Every claim on the page has to be true of the store edition: it calls you back and highlights decisions, it never accepts a
queue or locks in for you. Check `src/App.tsx` against `app/edition.js` before adding a feature line.

## Look

The app's tokens, verbatim (`src/webui/theme.css`): black `#0A0A0A`, one lime `#C6FF3D`, Anton for headlines, Space Mono
for everything else (self-hosted in `public/fonts/`). No other colours or faces.

## Screenshots

`public/img/*.webp` are real screens from the packaged store build, shot with fake data: a scratch profile, the fake League
client (`QP_FAKE_CS=draft`) and fixture recordings, with the recorder off so nothing captures the screen. The account in
them is the fake client's "Fake #TEST". Retake them the same way when the app's look changes.

## Develop and build

```bash
cd site
npm install
npm run dev        # http://localhost:3000
npm run build      # dist/: index.html prerendered, terms.html, privacy.html, assets
```

## Deploy

`Dockerfile` builds the site and serves `dist/` with nginx on port 3000 (Coolify: build pack Dockerfile, base directory
`/site`). Any static host works: upload `dist/`.

Before it goes public: fill the brackets in `public/terms.html` and `public/privacy.html` (effective date, contact email,
log retention, governing law), and point the Overwolf listing and the Riot application at the live URL.

> queuePop isn't endorsed by Riot Games or Valve.
