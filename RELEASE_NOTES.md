A fast fix for a 1.4.2 hiccup: clicking **Refresh champion data** could make all of your champion icons disappear. That's resolved — refresh works cleanly now, and if it happened to you, updating brings your icons right back.

## 🐛 Fixed

Champion icons no longer vanish after you use **Refresh champion data**. Refreshed portraits now display correctly everywhere — the picker, your plan, live champ select, and your profile. If your icons went blank in 1.4.2, this release restores them automatically.

## 🔧 Under the hood

Refreshed portraits are now copied into the app's own asset folder instead of being loaded from an external path the embedded browser refuses to render, so the relative image paths that already worked keep working.
