# TileSwitch

A tile-swap picture puzzle you can play in the browser or install as an app. Any picture becomes a puzzle: the image is sliced into a grid of square tiles, shuffled in place, and you swap them back until the picture is whole again.

**Play:** https://zhnuksyh.github.io/tileswitch/

## How to play

1. Pick a picture from your library, or hit **Shuffle** for the next one you haven't played.
2. Choose a difficulty.
3. Rebuild the image by swapping tiles:
   - **Tap-to-swap** — tap one tile, then tap another to trade their places.
   - **Drag-and-drop** — drag a tile onto the one you want to trade it with.

The puzzle is solved when every tile is home. There's no penalty for experimenting — only wasted moves cost you score.

## Features

**Your own pictures.** Drag in an image or pick one from your device and it becomes a puzzle. Uploads are re-encoded to WebP and stored on your device in IndexedDB, so they survive reloads and work offline. The app ships with five bundled starter images; once you add your own, the library is entirely yours (up to 60 images).

**Grids that fit the picture.** The tile grid adapts to the image's aspect ratio so tiles stay square — a wide photo gets more columns, a tall one more rows. Difficulty sets how many tiles run along the shorter side:

| Difficulty | Tiles on the short side | Roughly, on a 16:9 image |
| --- | --- | --- |
| Easy | 4 | 4 × 7 |
| Medium | 5 | 5 × 9 |
| Hard | 6 | 6 × 11 |
| Expert | 8 | 8 × 14 |

**Timer, score, and streaks.** A solve is scored on puzzle size minus penalties for time taken and moves beyond the minimum needed. Best score, fastest solve, and your longest streak are kept on the device. The streak counts consecutive solves and resets if you exit or restart mid-puzzle. Each of the three — timer, score, streak — can be switched off in Settings if you'd rather just play.

**History and notes.** Recently played images appear on the home screen with their solve time, date, and difficulty. Open one to read or write a note about it, and share the picture and its note as a framed image card rendered to PNG.

**Installable and offline.** TileSwitch is a PWA: install it from the browser and it runs standalone, fully offline. Sound effects are synthesized with the Web Audio API rather than shipped as files, so there are no audio downloads and nothing to break offline. Audio can be muted.

Everything you create — images, notes, history, records — stays on your device. There is no account and no server.

## Tech

TypeScript, Vite, Tailwind CSS, [lucide](https://lucide.dev) icons, and `vite-plugin-pwa` for the service worker. No UI framework — the interface is built from plain DOM. Dark mode only; Fredoka throughout.

Puzzle state and rendering live in [src/puzzle/](src/puzzle/), game rules and scoring in [src/game/](src/game/), image storage and history in [src/library/](src/library/), and screens in [src/ui/](src/ui/).

## Development

```bash
npm install
npm run dev      # dev server (service worker enabled, so the PWA is testable)
npm run build    # type-check, then build to dist/
npm run preview  # serve the production build
```

Pushing to `main` builds and publishes to GitHub Pages via [.github/workflows/deploy.yml](.github/workflows/deploy.yml). Production is served from the `/tileswitch/` base path.

There's also a kinetic-typography trailer at `/trailer/`, built as a separate entry and code-split so visiting either page never downloads the other's bundle.
