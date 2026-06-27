# Estoria

A visual story-mapping tool for novelists. Arrange chapters on an infinite
canvas, map scenes with the **but / therefore** method, track characters and
worldbuilding, and export to Obsidian-ready markdown.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

## Stack

Vite · React 19 · TypeScript · Zustand · Tailwind v4

## Where things are

- **Full spec, architecture & decisions:** [`docs/SPECS.md`](docs/SPECS.md) — read this first.
- **Data model:** [`src/types.ts`](src/types.ts)
- **State + actions:** [`src/store/useStore.ts`](src/store/useStore.ts)
- **Design reference:** `Story Mapping WebApp Prototype/` (static mock, not the app)

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run typecheck` | Types only |
| `npm run preview` | Serve the production build |
