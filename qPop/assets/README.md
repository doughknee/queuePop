# queuePop — Brand & Logo Package

The "Queue Sigil" mark (Concept C) for **queuePop**, built on the locked Hextech
system. All artwork is original and license-clean — it replaces the Riot-derived
`gnome-thresh.ico`, which must not ship.

Gold `#C8AA6E` (primary) + teal `#0AC8B9` (live) on near-black. Open
`brand-guidelines.html` in a browser for the full system.

## What's inside

### `svg/` — source, infinitely scalable, edit these
| file | use |
|---|---|
| `mark-primary.svg` | the mark, full color, live state (gold + teal + glow) |
| `mark-resting.svg` | bronze resting state (pre-pop) |
| `mark-mono-gold.svg` | single-color gold |
| `mark-mono-light.svg` | single-color light, for dark backgrounds |
| `mark-mono-dark.svg` | single-color dark, for light backgrounds |
| `mark-on-navy.svg` | mark on a navy tile (icon base) |
| `lockup-horizontal.svg` | mark + wordmark, side by side (font embedded) |
| `lockup-stacked.svg` | mark + wordmark, stacked (font embedded) |

### `png/` — rasterized marks (64 → 1024px) + 2x lockups

### `ico/` — Windows + web icons
| file | drop it here |
|---|---|
| `queuepop.ico` | replaces `assets/gnome-thresh.ico` (tray, PyInstaller, Inno `SetupIconFile`). 16/24/32/48/64/128/256px. |
| `favicon.ico` | site root |
| `favicon-32.png`, `favicon-512.png` | `site/public/` |

### `social/`
| file | drop it here |
|---|---|
| `og-image.png` | `site/public/og-image.png` (1200×630, referenced in `__root.tsx`) |

### `pwa/` — companion alarm page (`manifest.json`)
| file | size |
|---|---|
| `icon-192.png` | 192×192 |
| `icon-512.png` | 512×512 |
| `icon-512-maskable.png` | 512×512, safe-zone padded |

Add to `manifest.json`:
```json
"icons": [
  { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
  { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
  { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

## Regenerating
`build_svg.py` → marks + lockups · `build_raster.py` → PNG/ICO/OG/PWA ·
`build_guidelines.py` → the guidelines doc. Needs `cairosvg`, `pillow`, and the
two fonts in `fonts/`.

## License
Artwork: original, yours to use. Cinzel & Marcellus: SIL OFL (embeddable).
