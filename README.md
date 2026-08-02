# Office Navigator

A single-page React app for annotating office building maps with a traversable graph,
then navigating that graph to find paths between named rooms. Built for a new hire
finding their way around a large office building.

The app has two modes, toggled in the top bar:

- **Editor mode** — upload map images, annotate them with nodes and edges, label
  rooms, and connect sections across floors.
- **Navigator mode** — pick an origin and destination from named rooms and view the
  shortest path highlighted on the map, with optional step-by-step directions.

## Tech stack

- React + TypeScript, built with Vite
- HTML Canvas for map rendering and annotation
- `useReducer` for all graph state
- No backend — everything runs and persists client-side (localStorage + IndexedDB)

## Getting started

```bash
npm install
npm run dev       # start the dev server
npm run build     # type-check and build for production
npm run preview   # preview a production build locally
npm run lint      # run ESLint
npm test          # run the test suite (Vitest)
```

## Deployment

Pushing to `main` automatically builds and deploys to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Documentation

- [USER_MANUAL.md](USER_MANUAL.md) — how to use the app (Editor and Navigator
  walkthroughs)
- [CLAUDE.md](CLAUDE.md) — architecture, data model, and design decisions, for anyone
  working on the code
