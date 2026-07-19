# Pişti

Two-player Turkish card game (Pişti) — React + TypeScript + Vite PWA, with solo play against bots and Firebase-backed multiplayer.

## Platform targets

The game targets **all browsers** equally — desktop and mobile, every engine. There is no single "primary" platform. When touching browser-specific behavior (CSS prefixes, touch/gesture handling, timers, PWA features), verify coverage across Chrome, Firefox, Edge, and Safari (all iOS browsers use the Safari engine).

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — typecheck + production build
- `npm test -- --run` — Vitest suite
- `npm run lint` — lint
