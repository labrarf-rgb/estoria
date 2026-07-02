# Estoria — Specs & Session Notes

> Living document. This is the source of truth for what Estoria is, how it's
> built, and why. Update it whenever a decision is made or a feature lands.
> Newest session notes go at the **bottom** under "Session Log".

---

## 1. What Estoria is

A **visual story-mapping tool for novelists**. Authors arrange chapters on an
infinite canvas, map the scenes inside each chapter using the **but / therefore**
causality method, track characters and worldbuilding, and export everything as
Obsidian-vault-ready markdown.

It feels like a calm, papery desk tool (warm palette, serif display type), not a
flashy SaaS app. The aesthetic and full feature set come from the original design
prototype in [`Story Mapping WebApp Prototype/`](../Story%20Mapping%20WebApp%20Prototype%20/)
(`Estoria.dc.html` + screenshots) — that folder is the **design reference**, kept
for visual ground-truth. It is a static design-tool export and is **not** the
running app.

### Core concepts

- **Chapter** — a card on the board: number, act, status, title, summary, word
  count, the characters in it, an ordered list of **scenes**, and pinned refs.
- **Scene** — a beat inside a chapter. Consecutive scenes are joined by a
  **connector** typed `therefore` (causal), `but` (conflict), or `and` (parallel).
- **Chapter link** — a connector between two chapters on the board, same 3 types.
- **Character / World entry** — rich reference records.
- **Series** — optional multi-book planning layer above the current book, with its
  own story-map (books as cards) and timeline. Navigated via a header breadcrumb.
- **Draft / version** — **per book**: each book has its own named versions; a
  chapter carries per-version `title`/`summary` overrides (the `main` version is
  the base text). The version selector is hidden on the series map.
- **Project** — an independent `StoryDoc` (a standalone book or a whole series).
  Multiple projects live side by side in a library; you switch, create, delete,
  and merge them.

---

## 2. Tech decisions (and why)

| Decision | Choice | Why |
| --- | --- | --- |
| Build tool | **Vite 6** | Fast dev loop, first-class TS, simple config. |
| UI | **React 19 + TypeScript** | Prototype is already React-shaped; types keep the document model honest. |
| State | **Zustand 5** (`persist`) | One store maps cleanly onto the single document model; far less boilerplate than Context/reducers for this much shared, frequently-mutated state. |
| Styling | **Tailwind v4 + CSS variables** | The prototype's design tokens already exist as CSS custom properties; Tailwind v4 consumes them via `@theme`, so we keep the exact look and get utilities for the static chrome. Theming is a `data-theme` attribute swap. |
| Canvas | **DOM + SVG** (not `<canvas>`) | Cards are positioned divs on a transformed world layer; connectors are an SVG path layer. Text stays crisp, selectable, accessible. |
| Persistence | **Local-first**, behind a `StorageAdapter` | Auto-save to the browser + explicit file/markdown export. A cloud backend can be added later by implementing the same adapter — no UI/store changes. |

### Persistence architecture (the growth path to cloud)

Everything hinges on two seams so we can grow from local → cloud incrementally:

1. **One serializable document** — [`StoryDoc`](../src/types.ts) is plain JSON with
   a `schemaVersion`. It's exactly what we auto-save, what the user exports as a
   `.estoria.json` file, and what a server would persist.
2. **`StorageAdapter`** — [`src/store/persistence.ts`](../src/store/persistence.ts)
   defines `load()` / `save()`. v1 ships `LocalStorageAdapter`. Cloud later =
   write a new adapter against the same interface + swap `activeAdapter`.

What cloud adds later (and only then do we pay for it): **auth** and
**multi-device sync / conflict resolution**. Starting local does not lock us out.

**Decided 2026-07-01:** the cloud backend is the user's **own Google Drive**
(`GoogleDriveStorageAdapter`), with **Sign in with Google** for auth — see §8.
⚠️ Known issue: the current `zustandStorage` shim **bypasses the adapter on
read** and **double-writes on save** — this must be fixed before any cloud
adapter can work (see §9, item 1).

---

## 3. Project layout

```
estoria/
├─ index.html                 # Vite entry, loads Google Fonts
├─ vite.config.ts             # React + Tailwind plugins, "@/" → src alias
├─ tsconfig*.json             # app + node TS projects
├─ docs/SPECS.md              # ← you are here
├─ Story Mapping WebApp Prototype/   # design reference (not built on)
└─ src/
   ├─ main.tsx                # React root
   ├─ App.tsx                 # layout: Toolbar + Board + overlays; theme effect
   ├─ index.css               # Tailwind import + design tokens (@theme)
   ├─ types.ts                # StoryDoc and all model types  ← single source of truth
   ├─ data/sampleStory.ts     # "The Drowned Map" default document
   ├─ store/
   │  ├─ useStore.ts          # Zustand store: doc + UI state + all actions
   │  └─ persistence.ts       # StorageAdapter, zustand storage shim, file save/load
   ├─ lib/
   │  ├─ layout.ts            # board/timeline layout, auto-arrange, fit-to-content
   │  ├─ markdown.ts          # export builder, import prompt + scan
   │  └─ templates.ts         # story-structure skeletons
   └─ components/
      ├─ Toolbar.tsx
      ├─ Board.tsx            # canvas: pan/zoom/drag, cards, connectors
      ├─ ChapterDetail.tsx    # chapter modal: scene flow + act controls
      ├─ ui/Overlay.tsx       # Scrim / CloseButton / stop() primitives
      ├─ panels/              # CharactersPanel, WorldPanel, NotesPanel (right drawers)
      └─ modals/              # ExportModal, TemplatesModal, ImportModal, SeriesModal
```

### Conventions

- Imports use the `@/` alias for `src/` (e.g. `import { useStore } from "@/store/useStore"`).
- All persistent data lives in `doc`; transient UI state (open modals, camera,
  selections) lives alongside it in the store but is **not** all persisted —
  see `partialize` in `useStore.ts` (persists `doc` + durable prefs only).
- Colors/spacing reference design tokens (`bg-bg`, `text-ink`, `text-therefore`,
  `var(--shadow)`). Don't hardcode hex values.
- Runtime-computed styles (card x/y, zoom transform, character `oklch` colors,
  SVG paths) stay as inline `style={}` — Tailwind is for static chrome only.

---

## 4. Feature status

Legend: ✅ done · 🟡 partial · ⬜ not started

| Area | Feature | Status | Notes |
| --- | --- | --- | --- |
| Board | Pan / zoom / drag cards | ✅ | Wheel zooms; drag rearranges; double-click opens detail. |
| Board | Reorder chapters | ✅ | Board: drop a card on another → confirm → resequences **and** auto-arranges so threads stay clean. Timeline: drag to reorder with live reflow. Connector chain rebuilt to follow the new order. |
| Board | Connectors (therefore/but/and) | ✅ | SVG curves, colored by type, alt-draft aware. |
| Board | Auto-arrange | ✅ | Decaying-jitter grid, floored so it approaches straight but never a rigid lattice. |
| Board | Add chapter | ✅ | |
| Timeline | Vertical / horizontal layout | 🟡 | Layout + scroll-pan work; fit-to-view on switch not yet wired. |
| Detail | Scene flow canvas | ✅ | Drag-to-reorder scene nodes (live grid preview + edge auto-scroll), long-press Add scene to drop it in place, SVG connectors, click pill to cycle therefore/but/and, add/edit/delete scene, auto-arrange. |
| Detail | Edit title / summary / status | ✅ | Inline; status picker Idea/Draft/Done. |
| Detail | Act +/- controls | ✅ | |
| Detail | Pinned refs | 🟡 | Add note/image works; **renaming a ref label** still to do. |
| Characters | List + expand detail | ✅ | Read view complete. |
| Characters | Add | 🟡 | Adds a stub; **inline editing of fields** to do. |
| World | List + expand detail | ✅ | |
| World | Add / edit / refs | 🟡 | Add stub; editing + ref add to do. |
| Notes | Story notes editor | ✅ | Auto-saved, in export. |
| Templates | Insert / replace skeletons | ✅ | 6 structures. |
| Import | AI prompt + file scan | 🟡 | Prompt copy + summary work; **parsing markdown into the doc** not yet implemented. |
| Export | Markdown (Obsidian) | ✅ | Copy + download. |
| Export | Project file (.json) | ✅ | Save; **load/open** still to wire into UI. |
| Series | Planner view + mode toggle | ✅ | Read view; add/edit book to do. |
| Series | Add book / reorder / auto-arrange | ✅ | Toolbar "+ New book" and "Auto-arrange" (series map only). Reorder via grip handle: map drop → confirm → resequence + re-arrange; timeline drag → live reflow. |
| App | Light/dark theme | ✅ | |
| App | Drafts (main/alt) | ✅ | Toggle swaps titles/summaries/alt connectors. |
| Persist | Local auto-save | ✅ | Via zustand persist → LocalStorageAdapter (debounced; failures surfaced in footer). |
| Persist | One-click backup | ✅ | Footer "Back up" + folder icon (File System Access API). Keeps newest 5 per project, prunes older; download fallback on Firefox/Safari. |
| Persist | Project title editing | ⬜ | Field exists; no UI to rename yet. |

---

## 5. How to run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build to dist/
npm run typecheck  # types only
```

Node 20+ (developed on Node 24). VS Code: install the recommended extensions
(`.vscode/extensions.json`) for Tailwind IntelliSense + ESLint/Prettier.

---

## 6. Roadmap (suggested order)

1. ~~**Full chapter-detail editing**~~ — ✅ done (Session 2).
2. ~~**Inline editing for Characters & World**~~ — ✅ done (Session 3).
3. ~~**Project rename + multi-document picker**~~ — ✅ done (Session 6, Projects modal).
4. ~~**Timeline act band labels**~~ — ✅ done (Session 8). Fit-to-view on timeline
   switch still pending (board fit is done).
5. ~~**Markdown import parser**~~ — ✅ done (Session 9). `parseImportMarkdown`.
6. ~~**Open a project file from disk**~~ — ✅ done (Session 9). "Open file..." in
   the Projects modal. (Drag-drop onto the board still a nice-to-have.)
7. **Cloud backend = Google Drive + Google sign-in** — decided 2026-07-01, see
   §8 for the full plan. Prerequisites first: fix the persistence seam and
   quota/perf issues in §9 (items 1–3), then move hosting to Vercel (§8),
   then build `GoogleDriveStorageAdapter`. See also §7 Integrations
   (Obsidian/Google Docs).

---

## 7. Integrations / external sync (future, not started)

A separate area from the cloud backend. **Cloud (roadmap item 7, plan in §8)**
syncs Estoria's *own* data (`.estoria.json`) across the user's devices.
**Integrations** project Estoria *into other tools* (Obsidian, Google Docs) for
writing prose or sharing.

### The core tension

Estoria's model is a **structured graph** (board positions, scene node positions,
typed connectors, characters, world, per-book versions, multi-book). The targets
are **linear text**. Export is easy; reading edits *back* without losing structure
is the hard part. Stance: **Estoria owns structure; the external tool owns prose.**
Embed stable IDs + structural metadata as YAML front-matter / hidden blocks so a
round-trip survives; regenerate (don't store) anything the target can't represent
(e.g. board positions in a Google Doc).

Three levels of ambition: (1) one-way export — already have markdown; (2) one-way
push sync — keep the external copy updated; (3) two-way sync — reconcile both
sides (genuinely hard; do last, behind a manual "pull").

### Obsidian — preferred first integration (local, no backend)

- A vault is just markdown files in a folder; no API/OAuth. The browser writes to
  it via the **File System Access API** (user grants a folder handle once). Fits
  Estoria's local-first ethos and slots behind the existing `StorageAdapter` seam.
- Mapping (we're ~90% there): one note per chapter (folder per book),
  characters/world as notes, `[[wikilinks]]` (already emitted), a project index
  note. **Front-matter** carries `estoria-id`, act, status, version, scene order/
  positions, connector types → enables pull-back.
- Two-way is tractable: re-read on focus, **match by `estoria-id`, not title**
  (titles change), update chapter summary / scene prose from the body, keep
  structure from front-matter.

### Google Docs — later, one-way share (rides the cloud milestone)

- Real cloud API + **OAuth**; realistically needs a small **backend** (PKCE in a
  pure SPA hits CORS/quota friction). So it's coupled to the cloud milestone
  (roadmap item 7 / §8), not before it. Note: the §8 Google sign-in work gives
  us the OAuth client anyway — Docs export would add the `documents` scope.
- Rich text, not markdown: writing a clean formatted manuscript (chapters = H1,
  scenes = paragraphs) is fine; **parsing a Doc back is fragile**. Treat as a
  one-way "export to a shareable Doc" for editors who live in Google. **Skip
  two-way Docs** — not worth the cost.

### Key sequencing insight

The **markdown import parser** (§6 item 6) and the **Obsidian pull side** are the
same code (markdown → `StoryDoc`). Build the parser first: it makes Import actually
work *and* becomes the read-back engine for Obsidian sync. → Do parser, then
Obsidian folder sync, then (with cloud) one-way Google Docs export.

### Decisions to settle before building

- **Granularity:** sync per **book** (a book = a manuscript = a vault folder / one
  Doc), not whole-project.
- **Which version syncs:** just the **active** version (multiple versions → multiple
  files gets confusing).
- **Conflicts:** start with Estoria-owns-structure / external-owns-prose + a manual
  **pull** button before anything live or automatic.
- **Google Docs intent:** sharing with editors vs. writing there — likely sharing,
  which means one-way is enough.

---

## 8. Auth, cloud storage & hosting plan (decided 2026-07-01)

Decisions locked with the user in the 2026-07-01 session. This is the concrete
shape of roadmap item 7 (cloud backend).

### Auth — Sign in with Google, directly

- **Google OAuth directly** (Google Identity Services), no Supabase and no
  Firebase for auth. Drive already requires a Google account, so a separate
  auth provider adds nothing. Supabase/Firebase stay **optional later** only if
  a real hosted backend is ever needed.
- Web + Android use the same Google identity. Android needs its **own OAuth
  client ID** (normal Google setup), but no separate account-linking work.

### Storage — the user's own Google Drive

- A **`GoogleDriveStorageAdapter`** implementing the same `load()`/`save()`
  interface as `LocalStorageAdapter`. Store and UI unchanged — this is exactly
  the seam §2 was built for.
- **`drive.file` scope only**: the app sees only files it created, never the
  whole Drive. Works identically on web and Android.
- **Local-first stays.** `LocalStorageAdapter` remains as the offline cache;
  Drive syncs in the background. On first login, offer to migrate the existing
  local `StoryDoc` via the existing export/import path.
- **Cost: free at this scale.** The Drive API is free; storage comes out of the
  user's own Drive quota. No database to host or pay for.
- **Future sharing is not blocked**: Drive-native file sharing works
  immediately with no backend. Real collaboration (live cursors etc.) would be
  a new adapter added later — both can coexist.

### Implementation notes (from the 2026-07-01 code review)

- **Fix the seam first**: `zustandStorage` currently reads localStorage
  directly (never calls `activeAdapter.load()`) and double-writes every save.
  A Drive adapter dropped in today would never be read from. §9 item 1.
- **Debounce saves before Drive**: persist currently serializes the whole store
  on every keystroke — fine-ish locally, unacceptable against a network API
  (quota + latency). Debounce ~500ms trailing + flush on `beforeunload`. §9 item 3.
- **Granularity**: the persisted blob today is doc + `projectStash` + prefs in
  one string. For Drive, prefer **one file per project**
  (`<title>.estoria.json` in an app folder) plus keeping UI prefs local-only —
  needs a small widening of `StorageAdapter` (`list()` / per-id load/save)
  while the seam is being fixed anyway.
- **Images**: cover/ref images are base64 data URLs inside the doc; on Drive
  these should eventually become separate files referenced by ID (§9 item 13).
  Not a blocker for v1 of the adapter.

### Hosting migration (updated 2026-07-02 — see Session 22)

- **The embed is now a same-origin copy.** The built app is synced into the
  portfolio repo (`Portfolio-Website/estoria/`, via `npm run sync:portfolio`)
  and served at **www.labrarf.com/estoria/**; `estoria-app.html` iframes
  `/estoria/`. Reason: Chromium blocks the File System Access pickers
  (backup folder) in cross-origin iframes with no `allow` delegation, so the
  old github.io iframe couldn't offer folder backups. Same-origin fixes it
  and keeps Ray's URL on top.
- **Privatizing this repo is no longer blocked on Vercel.** The live demo now
  ships from the (public) portfolio repo as build output; the estoria source
  repo's own Pages site (`labrarf-rgb.github.io/estoria/`) is a secondary
  direct URL and can be retired when the repo goes private.
- **Vercel remains the eventual home** (rewrite/proxy under labrarf.com would
  make same-origin permanent without the copy step). When that happens:
  `vite.config.ts` hardcodes `base: "/estoria/"` in production — keep it if
  the app stays under a `/estoria/` path, switch to env-driven if it moves to
  a domain root.
- OAuth impact unchanged: authorized origins must list the final serving
  origin(s) — settle hosting before the Drive adapter so OAuth is set up once.
  With the same-origin copy, that origin is `https://www.labrarf.com`.

---

## 9. Known issues & fix backlog (code review, 2026-07-01)

Full-project review (store, persistence, layout, markdown, board/series/detail
components, modals). Ordered by priority. Check items off here as they land,
with a session-log entry.

### P1 — persistence layer (fix before any cloud work)

1. ✅ **Fixed 2026-07-01 (Session 20)** — reads now go through
   `activeAdapter.load()` (async rehydrate), the duplicate write is gone, and
   the legacy `estoria:doc:v1` copy is removed on first load to reclaim quota.
   Still open from this item: widening `StorageAdapter` to per-project
   granularity (deferred to the §8 Drive work).
   *Original finding:* **`zustandStorage` bypasses the adapter on read and double-writes on save**
   ([persistence.ts](../src/store/persistence.ts)). `setItem` writes the full
   serialized store twice — once via `activeAdapter.save()` (which stores under
   its own `estoria:doc:v1` key) and once directly to localStorage under the
   persist key `estoria:store:v1`. `getItem` reads only the latter, directly —
   `activeAdapter.load()` is **never called**, so the adapter copy is dead
   weight that ~halves the effective localStorage quota, and a future Drive
   adapter would save data no one ever loads. Fix: single write path through
   the adapter + an async-hydrate read path (zustand persist supports async
   storage), delete the duplicate key.
2. ✅ **Fixed 2026-07-01 (Session 20)** — `save()` now propagates errors; a
   `SaveStatus` pub/sub in persistence.ts drives the Footer, which shows a red
   "Couldn't save — browser storage is full" message on failure and the real
   last-successful-save time otherwise. *Original finding:*
   **Save failures are silent.** `LocalStorageAdapter.save` and the shim
   swallow quota errors (`QuotaExceededError`), while the footer keeps showing
   an autosave stamp — with base64 images in the doc, quota exhaustion is a
   *when*, not an *if*, and the user would lose work believing it saved. Fix:
   propagate save failure into store state, show it in the footer; consider
   IndexedDB (far larger quota) as the local adapter's backing store.
3. ✅ **Fixed 2026-07-01 (Session 20)** — saves are debounced 500ms trailing,
   with a synchronous flush on `beforeunload` and `visibilitychange → hidden`.
   *Original finding:*
   **Whole-store serialization on every keystroke.** zustand `persist` runs
   `partialize` + `JSON.stringify(doc + projectStash + prefs)` synchronously on
   each state change — typing in a scene textarea re-serializes every project
   (including embedded images) per keystroke. Debounce/throttle persist writes
   (~500ms trailing, flush on `beforeunload`). Mandatory before Drive.

### P2 — correctness bugs

4. ✅ **Fixed 2026-07-01 (Session 20)** — `deleteChapter` now bridges the two
   neighbors, carrying the incoming link's type. *Original finding:*
   **Deleting a middle chapter breaks the connector chain**
   (`deleteChapter` in [useStore.ts](../src/store/useStore.ts)): both links
   touching the deleted chapter are filtered out but the neighbors are never
   re-joined, leaving a permanent gap in the therefore-chain on the board.
   Fix: bridge the two neighbors (same idea as `reorderChapter`'s rebuild).
5. ✅ **Fixed 2026-07-01 (Session 20)** — both deletes now sweep the active
   book's chapters *and* every stashed `bookData[*]` book; world deletes clear
   `worldRefs` too. *Original finding:*
   **`deleteCharacter` / `deleteWorldEntry` leave dangling ids.**
   `deleteCharacter` cleans only the *active* book's chapters — chapters
   stashed in `bookData` (inactive books) keep the deleted id in `chars`.
   `deleteWorldEntry` cleans nothing — even active-book `worldRefs` keep the
   id. Renders are defensive (missing ids render as nothing) but counts and
   markdown export can leak raw ids (`charName` falls back to the id string).
   Fix: sweep `chapters` **and** all `bookData[*].chapters` on delete.
6. ✅ **Fixed 2026-07-01 (Session 20)** — the rebuilt chain now carries over
   the type of any adjacency that already existed (same approach as
   `reorderChapter`). *Original finding:*
   **`applyTemplate` (insert mode) wipes existing chapter-link types**: it
   rebuilds the whole `links` array as a fresh all-"therefore" chain, so an
   imported doc's `but`/`and` chapter links are silently reset when a template
   is appended. Fix: keep existing adjacencies' types (like `reorderChapter`).
7. ✅ **Fixed 2026-07-01 (Session 20)** — new `normalizeDoc()` in
   persistence.ts defaults every missing v3 field (books, bookData, drafts,
   per-chapter arrays) and validates ids; `readProjectFile` routes through it.
   *Original finding:*
   **`openDoc` / `readProjectFile` accept unvalidated shapes**
   ([persistence.ts](../src/store/persistence.ts)): validation is only
   "`chapters` is an array". A pre-v3 export or hand-edited file missing
   `books` / `bookData` / `drafts` crashes the toolbar on first render
   (`doc.books.find`). Fix: normalize/default all v3 fields on open (a small
   `normalizeDoc()` — also the natural home for future schema migrations of
   *files*, which unlike localStorage never went through zustand's `migrate`).
8. ✅ **Fixed 2026-07-01 (Session 20)** — the drop zone (and the whole modal,
   so near-misses don't navigate) now handles `dragover`/`drop` and feeds the
   same parse path as the file picker. *Original finding:*
   **Import modal advertises drag-and-drop but has no drop handler**
   ([ImportModal.tsx](../src/components/modals/ImportModal.tsx) — "Drop a .md
   file here"): dropping a file triggers the browser's default navigation and
   leaves the app. Fix: `onDragOver` preventDefault + `onDrop` → same parse
   path as the file input (and the board-level drag-drop nice-to-have from §6
   could share it).
9. ✅ **Fixed 2026-07-01 (Session 20)** — the fit effect is keyed on `doc.id`
   as well. *Original finding:* **Board camera doesn't re-fit when switching
   projects.** The fit effect was keyed on `activeBookId` only, but
   `emptyStory()` and every import hardcode the book id `"book-1"`, so
   switching between two standalone projects kept the stale camera.
10. ✅ **Fixed 2026-07-01 (Session 20)** — the loose fallback is gone; only
    headings *starting* with "act" parse as acts. *Original finding:*
    **Import parser: any `##` heading containing "act" becomes an Act** (the
    fallback `/act/.test(h)` misparsed sections like `## Factions`).

### P3 — quality / round-trip / UX

11. 🟡 **Mostly fixed 2026-07-01 (Session 20)** — export now emits `## World`
    and full character fields (Desc/Bio/Traits/Goals/Motivations/Wants|Needs)
    in the import-prompt schema, and the parser learned the `Desc:` line, so
    the round-trip keeps them. Still open: export covers only the **active
    book** — add a per-book choice (or label it) when the Obsidian work starts.
    *Original finding:* **Markdown export is lossy vs the import schema.**
12. **Wheel zoom is origin-anchored, not cursor-anchored** (Board + SeriesMap):
    zooming drifts the content instead of zooming at the pointer. Standard fix:
    adjust pan so the world point under the cursor stays fixed.
13. **Images live inline in the doc as data URLs** (covers, image refs): bloats
    every autosave/export and is the main localStorage-quota risk. Plan: store
    image blobs separately (IndexedDB locally / own Drive files later),
    reference by id. Coordinate with the Drive adapter design (§8).
14. **Cosmetic**: delete-chapter confirm shows the base `ch.title` rather than
    the draft-resolved title; `ChapterDetail` subscribes to the whole `doc`
    (every keystroke re-renders the full modal — fine at current scale, use
    narrower selectors if it ever feels sluggish).

---

## 10. Session Log

### 2026-06-27 — Project scaffolded (Session 1)

- Reviewed the design prototype (`Estoria.dc.html` + 6 screenshots). Confirmed it's
  a static design-tool export; extracted the data model, sample story, templates,
  import prompt, and export format from its embedded logic.
- Decisions locked with the user: **Vite + React + TS + Zustand**, **local-first
  auto-save + file/markdown export behind a `StorageAdapter`**, **Tailwind v4 +
  existing CSS variables**.
- Scaffolded the full project: config, design tokens, `StoryDoc` model, sample
  story, Zustand store with persistence, layout/markdown/template libs.
- Built a working vertical slice: Toolbar, Board (pan/zoom/drag/connectors/
  auto-arrange), Chapter Detail (scene flow + act controls), Characters/World/
  Notes panels, and Export/Templates/Import/Series modals.
- Verified: `npm run build` passes (51 modules), dev server renders with no console
  errors, design matches the prototype.
- Remaining work captured in §4 (status table) and §6 (roadmap).

### 2026-06-27 — Chapter-detail editing + CSS fix (Session 2)

- Built the full chapter-detail craft loop: draggable scene-node canvas with SVG
  connectors, **click a connector pill to cycle therefore/but/and**, add / edit
  (inline textarea) / delete scenes, auto-arrange, plus inline editing of chapter
  title, summary, and an Idea/Draft/Done status picker. New store actions:
  `patchChapter`, `addScene`, `updateScene`, `deleteScene`, `moveScene`,
  `cycleSceneLink`, `arrangeScenes`, `addChapterRef`. `openChapter` now lays out
  scene positions on first open (preserving manual drags).
- **Important CSS fix:** removed the global `* { margin:0; padding:0 }` reset from
  `index.css`. Tailwind v4 emits utilities inside `@layer`, and **unlayered CSS
  beats layered CSS regardless of specificity**, so that reset was silently
  zeroing every Tailwind margin utility app-wide (e.g. `ml-auto`, chip overlaps,
  textarea margins). Tailwind's preflight already provides the reset. Do not
  re-add an unlayered universal reset — see the note in `src/index.css`.
- Verified in-browser: connector cycling, add scene, inline edits, drag, and
  right-aligned toolbar all work; `npm run build` passes.

### 2026-06-27 — Multi-book, versions, editing everywhere (Session 3)

Large milestone + fix batch. **Schema bumped to v2** (persist `migrate` discards
older persisted docs and reloads the sample, so no broken shapes on upgrade).

Data model (`src/types.ts`):
- **Multi-book** via an "active-set + stash" design: the active book's board lives
  top-level (`chapters`, `links`, `storyNotes`) so canvas components stay simple;
  inactive books are stashed in `bookData[bookId]` and swapped in by `switchBook`.
  `books: BookMeta[]` replaces the old `series` array.
- **Draft versions**: `drafts: DraftVersion[]` + `activeDraftId`. Per-chapter
  `overrides[draftId] = {title?, summary?}`. The "main" draft is the base text;
  editing under any other draft writes overrides. Helpers in `src/lib/drafts.ts`
  (`resolveTitle`, `resolveSummary`, `displaySummary`). Replaces the hardcoded
  main/alt flags + `altTitle`/`altSummaryFlag`.
- **Shared assets** (`assets: Asset[]`): book-level notes/images that can be linked
  into any chapter (`linkAssetToChapter`). Managed in the Notes panel library.
- **Richer refs**: `PinnedRef` now has `id`, `body` (note text), `src` (image data
  URL), and optional `assetId`. Chapter `notes` field added.

UI work:
- Editable everywhere: project title (toolbar), characters & world (all fields,
  add/delete), world/chapter refs (add/edit/delete), chapter character membership
  (toggle chips), chapter notes, scenes (already), book meta (Series planner).
- **Image upload + lightbox**: `RefList` (`src/components/ui/RefList.tsx`) handles
  note/image refs with file upload (stored as data URLs); images open in
  `Lightbox.tsx` with click-to-zoom. Reused by chapter detail, World, and Notes.
- Toolbar: editable title; **version dropdown** (select/add/delete versions);
  **Series button** to zoom out to the multi-book view; **orientation as always-
  visible ↓/→ arrow buttons** next to Board/Timeline (fixes the layout shift from
  the old appearing/disappearing segmented control); **New menu now leads with
  "New book"**. New chapter / Auto-arrange and the canvas hint moved to a top
  strip (`BoardActions.tsx`). Footer (`Footer.tsx`) shows the autosave stamp and
  "Built by Ray Labra" → labrarf.com.
- Autosave already happened via zustand `persist`; the footer now surfaces it.
- Em dashes removed from UI chrome / labels / template blurbs. (Sample-novel prose
  in `sampleStory.ts` keeps its dashes — it's example content, not UI.)

Verified in-browser: version override (ch8 → "The Drowned Return" under Alt),
book switching (Book Two empty board ↔ Book One's 8 chapters restored from stash),
Series planner editing, chapter character toggles, status picker. `tsc -b` clean.

Known cosmetic limitation: the toolbar is dense and clips on the right below
~1100px viewport width; fine at desktop widths. Candidate for a future overflow
menu.

### 2026-06-27 — Series story-map + single toolbar (Session 4)

- Consolidated to a single toolbar (removed the BoardActions strip): New chapter
  and Auto-arrange now live on the bar; the canvas hint moved to the footer. The
  bar is `overflow-x-auto` so nothing is ever unreachable; theme is icon-only;
  the series/book control is hidden until the project is a series.
- **Series story-map** (schema v3). BookMeta gained `x`, `y`, `notes`; new
  `bookLinks: BookLink[]` (plain connectors, multiple per pair, optional labels).
  `SeriesMap.tsx` is a pan/zoom canvas of draggable book cards (inline title/
  synopsis/status, chapter & word counts, Open). Connect mode draws labeled
  multi-connectors between books; labels are editable and deletable.
- **Hierarchy + navigation**: `level: 'series' | 'book'` UI state. Toolbar shows a
  `Series ▸ Book One` breadcrumb when seriesMode is on; double-click / Open a book
  to drill into its chapter board, click `Series` to zoom back out. The old
  Series planner *modal* was removed in favor of the map (SeriesModal.tsx deleted);
  "+ New" now offers "Make this a series" / "Open series map".
- Defensive: SeriesMap and the book-link store actions tolerate a missing
  `bookLinks` array (older/partial persisted docs).
- Verified in-browser: enabling series mode, the map with sample book links,
  drill-in to a book board, breadcrumb back to the map. `tsc -b` + `vite build`
  clean.

### 2026-06-27 — Fixes + onboarding + series timeline (Session 5)

- **Dropdown bug fix**: the toolbar's `overflow-x-auto` was clipping the version
  and "+ New" menus (overflow-x:auto forces overflow-y:auto). New
  `components/ui/Popover.tsx` renders menus into a `createPortal` with `fixed`
  positioning anchored to the trigger, so they escape any ancestor clipping.
- **Board auto-fit** (`Board.tsx`): fit-to-content on first load and on book
  switch (keyed on `activeBookId`); when a newly added chapter lands off-screen,
  auto fit-to-screen (visibility check against the current camera).
- **First-launch welcome** (`Welcome.tsx`): persisted `onboarded` flag; on first
  run the user picks "Explore the sample" (`useSample`) or "Start fresh"
  (`startFresh` → `emptyStory()` + opens Templates for creation options).
  `data/emptyStory.ts` is the blank-project factory.
- **Series-level timeline**: the Board/Timeline + ↓→ controls now show at the
  series level too; `SeriesMap` lays books in reading order (vertical/horizontal)
  when `view === 'timeline'`, free canvas positions otherwise. Drag is disabled in
  timeline mode. Toolbar labels the spatial view "Map" at series level.
- **Book cover images**: `BookMeta.coverSrc?`; series cards show an upload "+ Add
  cover" affordance, render the cover as a banner, and open it in the lightbox on
  click.
- Verified in-browser: welcome flow, auto-fit on load + on add, portal dropdowns,
  series timeline layout, delete-chapter cleanup. `tsc -b` + `vite build` clean.

### 2026-06-27 — Multi-project, File menu, header redesign (Session 6)

- **Multi-project library**: independent projects, each its own `StoryDoc`. Store
  keeps the active `doc` plus `projectStash` (inactive full docs) and derives the
  list via `listProjects()`. Actions: `switchProject`, `newProject({series,
  keepCurrent})`, `deleteProject` (never leaves zero projects). `projectStash` is
  persisted. New `ProjectsModal` ("Open project") lists/switches/deletes/creates.
- **Header redesign** (`Toolbar.tsx`): "Estoria" wordmark; an `EditableName`
  component shows the real Series name ▸ Book name (single click navigates,
  double-click renames); words/chapters stat sits under the names; the version
  dropdown moved to the right of the names. Versions are renamable inline (radio
  to activate, input to rename, ✕ to delete) plus "+ Add version".
- **File menu** (replaces "+ New"): New book, New chapter, Use a template, Import
  markdown, Open project, Make this a series (when standalone), Export. "Open
  series map" removed (the series name in the header navigates there).
- **New-book chooser** (`NewBookModal`): Standalone / Start a series / Add to an
  existing series (lists series projects). Before a new project replaces the
  current one it prompts: Keep it / Export a copy then keep / Discard.
- **Chapter modal**: characters AND world entries are linkable via toggle chips
  (`toggleChapterChar`, `toggleChapterWorld`; `Chapter.worldRefs`).
- Verified in-browser: header names/stat/version, File menu items, projects
  create/switch/delete (two independent projects), save-current prompt, chapter
  world/character toggles. `tsc -b` + `vite build` clean.

### 2026-06-28 — Confirmations, overflow, chapter polish, project merge (Session 7)

- **Global confirm dialog**: store `askConfirm({message,detail,danger,onConfirm})`
  + `ConfirmDialog`. All destructive deletes route through it (chapter, scene,
  ref via RefList, character, world entry, version, book, book link, project).
- **Toolbar**: dropped the "E" box for an italic-serif "Estoria" wordmark. Zoom +
  theme collapse into a "⋯" menu only when the bar overflows (ResizeObserver with
  190px hysteresis to avoid flip-flop).
- **Chapter modal**: editable per-chapter word count (sums into the book total);
  Characters and World sections are now member lists with explicit remove (✕) and
  an add-picker (existing + create new), not highlight-all; "World in this
  chapter" renamed to "World details"; Scene flow has an Expand toggle
  (40vh ↔ 74vh); pinned references use uniform fixed-size cells so they align.
- **Project merge** (`mergeProjectIntoSeries`): move a standalone project's
  book(s) + characters/world/assets into an existing series, then drop the source.
  Surfaced as "Merge" in the Projects modal.
- Verified in-browser: wordmark, editable words, char/world add+remove pickers,
  delete confirmation prompt, multi-project. `tsc -b` + `vite build` clean.

### 2026-06-28 — Per-book versions, timeline act bands, modal/series fixes (Session 8)

- **Versions are per book** (not per series). `drafts` + `activeDraftId` moved into
  `BookData`; the top-level `drafts`/`activeDraftId` now represent the *active*
  book's versions and are stashed/restored alongside chapters/links/notes in
  `switchBook`, `addBook`, and `mergeProjectIntoSeries`. The version dropdown is
  hidden on the series map (it's a book-level concern). Sample data: Book One has
  `[Main draft, Alt ending]`; Books Two/Three start with `[Main draft]`.
  Verified: Book 1 shows both versions, Book 2 only `Main draft`.
- **Scene-card stacking fix** (`ChapterDetail.tsx`): the scene canvas is now an
  isolated stacking context (`isolate`), so its absolutely-positioned scene cards
  (z-5/z-10) no longer paint over the sticky modal header when the modal scrolls.
- **Series connect fix** (`SeriesMap.tsx`): the viewport only pans / cancels
  connect mode on a *background* mousedown — card mousedowns are ignored via a
  `[data-book-card]` guard. Previously a bubbled card mousedown (notably in
  timeline mode, which doesn't stop propagation) cancelled connect mode before the
  click registered, so books couldn't be connected. Verified: link count 3→4.
- **Series File menu**: "New chapter" and "Use a template" are book-level only and
  are hidden on the series map.
- **Scene flow expanded by default**: the chapter modal opens with the scene
  canvas expanded; expanded mode now uses a wider modal (`min(1320px, 96vw)`) and a
  taller canvas (`78vh`) to take up more of the screen. Toggle reads Collapse/Expand.
- **Act bands in the book timeline** (`Board.tsx`): in timeline view, each Act gets
  a labelled dashed band behind its (consecutive) chapters — "Act I / II / III" —
  so the grouping is visible. Works in both vertical and horizontal orientations;
  bands sit behind connectors/cards and pan/zoom with the canvas.
- All changes verified in-browser; `tsc -b` clean. Committed locally (not pushed to
  GitHub yet — remote setup to be discussed).

### 2026-06-28 — Markdown import parser + open from disk (Session 9)

- **Import actually works now.** `parseImportMarkdown(text, fileName)` in
  `lib/markdown.ts` turns the import-prompt schema into a complete `StoryDoc`:
  title + premise; `## Characters` (`**Name** — role | archetype` plus
  bio/traits/goals/motivations and a combined `Wants: … | Needs: …` line);
  `## World` (`**Name** [Category] — desc // Notes: …`); and `## Act N` → `### n.
  Title · 3,200 words` with a `> summary`, a `Scenes:` numbered list whose
  `(therefore|but|and)` tags become scene connectors, and a `Characters:` line.
  Tolerant of AI drift (smart dashes, missing optional fields, spacing); unknown
  chapter character names are created as stub characters so nothing is dropped.
  Chapters are grid-laid-out and chained with `therefore` links.
- **Import modal** parses the dropped file, shows accurate counts (chapters/
  scenes/characters/world), reports a clear error if no chapters are found, and
  opens the result as a **new project** (current project stays in the library).
- **`openDoc(doc)`** (store): stash current project, activate the incoming doc
  (fresh id on collision). Shared by import and open-from-disk.
- **Open from disk**: "Open file..." in the Projects modal reads an exported
  `.estoria.json` via `readProjectFile` → `openDoc`, with an error on bad files.
- Verified in-browser with a fresh sample manuscript ("The Glass Orchard"):
  3 chapters / 8 scenes / 2 characters / 3 world parsed correctly — board cards,
  word counts, scene connectors (Therefore/But), character chips, and World
  categories all correct. `tsc -b` + `vite build` clean.
- Roadmap: the two main functional gaps are now closed. Remaining: drag-drop file
  onto the board (nice-to-have), timeline fit-on-switch, and the cloud/integrations
  work (§4, §7). Still local-only — not pushed to GitHub.

### 2026-06-28 — Import-prompt rewrite, snap/arrange, overflow fix (Session 10)

- **Import prompt hardened** (`importPrompt`): explicit "organizer, not co-author"
  framing with absolute-fidelity rules (don't invent/continue/embellish; leave
  unknown fields blank) to stop models like Gemini from fabricating. Asks for a
  **downloadable `.md` named `<Title> - estoria download.md`** (or a `FILENAME:`
  first line if it can't attach), and explicitly supports **paste OR file
  attachment** (use the attachment if both). Parser already tolerates a leading
  `FILENAME:`/code-fence line.
- **Timeline → board snap** (`Board.tsx`): returning to the board from the
  timeline now fits-to-content, so the timeline's scroll position no longer leaves
  the board looking empty.
- **Auto-arrange also fits** the arranged grid to the visible board (additive;
  the grid/jitter algorithm is unchanged) — result is always on-screen.
- **Toolbar overflow fix**: the ⋯ (collapsing zoom/theme) now appears **only when
  the bar truly overflows**. Rewrote the measure to remember the expanded
  `fullWidth` and expand back once `clientWidth ≥ fullWidth + 8`, re-measuring via
  `useLayoutEffect` each render + ResizeObserver + window resize (the old
  guess-from-compacted-width heuristic got stuck compact).
- Verified in-browser: ⋯ hidden at 1600px / shown at 980px / hidden again at
  1600px; timeline-pan then back-to-board shows cards; auto-arrange fits all 8
  sample chapters on screen. `tsc -b` clean.

### 2026-06-28 — Structure templates expanded; New-project modal fix (Session 11)

- **Projects modal "+ New project" fix**: it opened the New Book chooser *behind*
  the still-open Projects modal (looked like nothing happened). Now closes Projects
  first, so the chooser is on top.
- **Story-structure templates** (`lib/templates.ts`) expanded from the in-house
  "Narrative Frameworks and Story Structure Research" compendium:
  - **Single Blank Chapter is now the first option** in the Templates modal.
  - **Hero's Journey split** into two entries: **Vogler (12 stages)** and
    **Campbell (17 stages)** with the full Departure/Initiation/Return taxonomy
    ("Woman as Temptress" modernized to "Temptation").
  - **New frameworks added**: Dan Harmon's Story Circle (8), Story Grid Five
    Commandments (Coyne), Kishotenketsu (4-act, no-conflict — uses a real Act 4),
    Propp's Morphology (folktale functions), Sanskrit Panchasandhi
    (Natyasastra), Jo-ha-kyu (pacing). Existing three-act/Save the Cat/romance/
    mystery retained.
  - Deliberately NOT added as chapter templates (they aren't one-chapter-per-beat
    structures): Snowflake Method, Scene-&-Sequel, MRUs, GMC, McKee value charges,
    Vonnegut shapes, interactive-fiction topologies. Candidates for other UI later.
- Source note: research lives in the user's Obsidian vault ("Narrative Frameworks
  and Story Structure Research.md"), outside the repo.
- Verified in-browser (Templates order + new entries render); `tsc -b` + `vite
  build` clean. Local only — not pushed to GitHub.

### 2026-06-28 — Shipped to Pages; smarter auto-arrange (Session 12)

- **Live**: merged `multi-book-and-editing` → `main`, created public repo
  `labrarf-rgb/estoria`, added Vite `base: /estoria/` (prod only) and a GitHub
  Actions Pages workflow. Site auto-deploys on push to main:
  https://labrarf-rgb.github.io/estoria/ (embedded on labrarf.com — beta).
- **Auto-arrange maximizes board space** (beta feedback: 17-stage Hero's Journey
  was a fixed 4-wide grid → tiny 69% fit on a 13" MacBook Air). New
  `bestColumns(n, vpW, vpH)` in `lib/layout.ts` picks the column count whose
  fit-to-content zoom is largest (ties break toward the grid aspect closest to
  the viewport, so small boards don't become a tall single column). `autoArrange`
  takes an optional `cols`; the Board reports its size to the store
  (`setBoardSize` via ResizeObserver) and `autoArrangeBoard` feeds `bestColumns`.
  Also tightened the grid + fit padding (gaps 48/56, margin 28, `FIT_PAD` 36,
  shared by `autoArrange`/`bestColumns`/`fitToContent`) so the fit zooms in to
  actually fill the board instead of leaving big margins. The `FIT_ZOOM_MAX`
  (1.05) cap keeps a 1–4 card book from blowing up to oversized cards.
  Verified: 17 chapters lay out 5-per-row and fill the board (~85%); a 4-beat
  book stays at a normal ~105% size, centered.
- **Balanced grids on ties** (beta follow-up): on a wide screen, small counts hit
  the zoom cap for several column counts; the tie-break now prefers a square-ish
  grid (closest to `ceil(sqrt(n))`, nudged toward more columns) instead of
  matching the viewport aspect — so 4 cards become 2x2, not 3+1. The
  maximize-zoom path is unchanged, so larger counts still spread wider to use the
  available width. Verified: 4 cards = 2x2 at 1680px wide.
- **Scene auto-arrange fills the visible canvas** (beta follow-up): the chapter
  modal's scene canvas isn't zoomed, it scrolls, so `sceneColumnsForWidth(n, visW)`
  packs as many columns as fit the *visible* canvas width; `sceneAutoArrange`/
  `arrangeScenes` take an optional `cols`. The chapter modal measures the scene
  box (`sceneBoxRef`) at click time, so Auto-arrange lays out into more columns
  when expanded and fewer when collapsed — each mode fills its own width.
  Verified: 12 scenes → ~5 columns expanded (box ~1252px) vs 3 collapsed
  (box ~912px).

### 2026-06-30 — Expandable notes + card/list ref views (Session 13)

Readability + browsing pass over notes and references. Two small reusable UI
primitives now back every notes/refs surface:
- **`ui/ExpandableTextarea.tsx`** — a textarea with an Expand/Collapse pill (swaps
  a compact row count for a tall fixed height) plus native `resize-y` drag, so any
  reading/editing area can be made longer.
- **`ui/ViewToggle.tsx`** — a small segmented Card / List switch (values `"card"`
  / `"list"`, exported `RefView` type).
- **`RefList` gained a `view` prop.** Card view is unchanged (fixed-size grid);
  the new **list view** renders compact rows (icon · title · snippet) that you
  click to expand into an inline detail editor — note title + body, or image
  title + thumbnail/upload. Add/Link buttons sit in a row beneath the list.

Wired into all three consumers:
- **Story notes** (`NotesPanel`): the main notes textarea is now an
  `ExpandableTextarea` (9 rows collapsed → 62vh expanded); the shared library has a
  Card/List toggle.
- **World detail** (`WorldPanel`): Description and Notes are `ExpandableTextarea`s
  (40vh expanded, `pr` reserved for the pill); each entry's References have a
  Card/List toggle (shared view state across entries).
- **Chapter modal** (`ChapterDetail`): Chapter notes is an `ExpandableTextarea`
  (3 rows → 52vh); Pinned references have a Card/List toggle.

Verified in-browser on the sample: story-notes expand + library list view with
click-to-expand; chapter notes expand; pinned-refs list view (image row expands to
its upload/thumbnail, note row to title+body); world Description/Notes expand +
References Card/List toggle. `tsc -b` + `vite build` clean (65 modules).

Follow-ups: **list is the default** ref view (RefList prop + all three consumers'
initial state); Card is one click away.

### 2026-06-30 — Collapsible chapter-modal sections (Session 14)

The chapter modal was getting tall. Its sections can now be **collapsed to a
single header row** that stays visible (same disclosure idea as the Characters /
World side-panel entry cards), so you can compact what you're not using and shrink
the modal.

- **Which sections:** Characters, World details, Chapter notes, Pinned references.
  Scene flow is deliberately excluded — it already has its own Collapse/Expand
  sizing toggle (40vh↔78vh) and two competing controls would confuse.
- **`SectionHeader`** (local to `ChapterDetail.tsx`): a clickable label + `▸/▾`
  chevron; collapsing hides the body. Shows a light count hint when there's content
  (`CHARACTERS · 2`, `PINNED REFERENCES · 1`, chapter notes shows `· written`).
  The refs view (Card/List) toggle rides in the header's `right` slot and only
  shows when that section is expanded.
- **Persisted, global** collapse state: new store field
  `chapterSectionsCollapsed: Record<ChapterSection, boolean>` (`ChapterSection =
  "chars" | "world" | "notes" | "refs"`) + `toggleChapterSection`, added to
  `partialize` so it survives reloads. It's a global preference (applies to every
  chapter), not per-chapter — collapse Pinned references once and every chapter you
  open opens it collapsed. Older persisted state without the key falls back to the
  all-expanded default via zustand's shallow merge (no migration needed).

Verified in-browser: collapsing Characters/World/Notes/Refs compacts each to a
header row while Scene flow stays open; localStorage shows the four flags; reload
restores them. `tsc -b` + `vite build` clean.

Follow-up (same session) — **the remaining view/size states now persist too**, all
as global prefs added to `partialize`:
- `refView: RefView` — the Card/List choice, shared across chapter pinned refs, the
  story-notes library, and world refs (one setting, `setRefView`). The three
  consumers dropped their local `useState` for the store value.
- `textareaExpanded: Record<TextareaKey, boolean>` (`"storyNotes" | "chapterNotes"
  | "worldDesc" | "worldNotes"`) + `toggleTextarea` — remembers each expandable
  textarea's tall/short state. `ExpandableTextarea` gained optional controlled
  props (`expanded` / `onToggleExpanded`); it still self-manages when they're
  omitted.
- `sceneFlowExpanded: boolean` + `setSceneFlowExpanded` — the chapter modal's
  scene-flow Collapse/Expand (replaces its old local `expanded` state; default
  still expanded).
  Verified: set Card view + collapse scene flow + expand chapter notes, reload →
  all three restored from localStorage. `tsc -b` + `vite build` clean.

### 2026-06-30 — Even scene grid, connectors clear of text (Session 15)

The and/but/therefore connector pills were painting over scene-card text, and the
scene layout's decaying jitter made the spacing look uneven.

- **Even grid** (`lib/layout.ts`): `sceneAutoArrange` drops the jitter/stagger —
  scenes lay out on a plain equal-gap grid. Equal gaps also keep every connector
  pill parked in the space between cards.
- **Wider horizontal gap:** `SCENE_GAP_X` 44 → **88** (the widest pill, "Therefore",
  measures ~79px, so 88 clears it with the cards' 13px padding as slack);
  `SCENE_GAP_Y` 40 → 48. Now a horizontally-adjacent connector sits in the gap, not
  over text; row-wrap connectors land in the vertical gap between rows.
- **Expand fits 5 / collapse fits 3:** the expanded chapter modal widened to
  `min(1500px, 96vw)` (was 1320) so five 208px cards + four 88px gaps fit across;
  collapsed stays `min(980px, …)` → three across. `sceneColumnsForWidth` (unchanged
  formula) yields 5 vs 3 at those widths.
- **Auto-reflow on mode toggle:** toggling Scene-flow Collapse/Expand now
  re-arranges to the new column count (an effect in `ChapterDetail` that fires only
  on an actual toggle, via a prev-value ref, so it never clobbers manual drags on
  open or chapter-switch). `openChapter` also seeds a fresh chapter's layout using a
  width estimate for the current mode (`window.innerWidth`-based), so it opens
  already filled.

Verified in-browser at 1680px: 7 scenes lay out 5-across expanded with all
BUT/THEREFORE pills sitting in gaps (no text covered), then reflow to 3-across on
Collapse. `tsc -b` + `vite build` clean.

### 2026-07-01 — Scene drag-to-reorder, long-press insert, ref delete placement (Session 16)

Scene positions in `scenePos` are always a clean auto-arranged grid now (nothing
freeform left), so scene dragging was reworked from "move to an arbitrary x/y" into
a real **reorder**, plus two smaller fixes.

- **Add scene auto-arranges.** `addScene`/new `insertScene` (`useStore.ts`) recompute
  the whole grid via `sceneAutoArrange` instead of nudging the new card's position by
  a fixed offset, so a new scene always lands in a proper grid slot. `moveScene`
  (arbitrary x/y) is removed — it was already inconsistent with `openChapter`'s
  grid-seeding behavior.
- **Drag-to-reorder with live preview** (`ChapterDetail.tsx`): dragging a scene card
  now previews the drop: every other card reflows to the grid position it'll land in,
  a dashed placeholder marks the target slot, and the grabbed card follows the
  cursor as a ghost. The reorder only commits (new store action `reorderScene`) on
  mouseup, and only if the pointer is actually over a slot — dragging further just
  keeps moving the preview. `sceneLinks` (the therefore/but/and connectors) are
  treated as positional (a gap between cards, not tied to a specific scene), so a
  reorder always ends with a valid `scenes.length - 1` links array — connector
  continuity is never broken. Connectors are hidden while dragging to avoid
  stale-looking lines mid-reflow.
- **Long-press Add scene to insert**: holding the button ~220ms spawns a draggable
  "New scene." ghost using the same preview/insert mechanism as an existing-scene
  drag (`insertScene`); a quick click still just appends to the end.
- **Auto-scroll while dragging**: a `requestAnimationFrame` loop scrolls the scene
  canvas up/down when the pointer nears its top/bottom edge, so reordering works on
  chapters with more scenes than fit on screen.
- New `sceneSlotFromPoint` (`lib/layout.ts`) maps a canvas-local point to a row-major
  grid slot — shared by the live preview and the commit logic. Bug caught in
  testing: the mousemove handler was computing the grid's column count from a
  different item total (`n-1`) than the render preview used (`n`), desyncing the
  detected drop slot from what was visually shown; fixed by unifying both on the
  same "total slots including the gap" value.
- **Pinned reference notes** (`ui/RefList.tsx`, list view): the delete (✕) was
  sitting right next to the expand/collapse caret, easy to mis-click. Removed it
  from the collapsed row; it now only appears in the expanded body, next to the
  title field.

Verified in-browser (sample chapter, "The Drowned Map"): dragging a scene mid-list
reflows the other cards and commits to the right position; dragging to the far
bottom appends it last; long-press Add scene previews and inserts between two
existing scenes; a quick click still appends normally; expanding a pinned note shows
its delete button, the collapsed row shows only the caret. `tsc -b` + `vite build`
clean. Committed and pushed to `origin/main`.

### 2026-07-01 — Reorder chapters & books (board + timeline), series auto-arrange, "+ New book" (Session 17)

Brought the scene reorder idea (Session 16) to the chapter board and the series
map. This went through several rounds of user feedback; the notes below describe
the **final** shape, not the intermediate drafts.

Two reorder gestures per view, because board/map are a freeform corkboard while
timeline is an ordered lane:

- **Timeline view (chapters & books)** — the clean, dedicated reorder. Dragging a
  card live-splices a preview order and every card (including the dragged one)
  reflows to the resulting sequential slots; commit on release. Positions are
  derived from array order here, so nothing needs auto-arranging afterward.
  Implemented in `Board.tsx` (`timelineChapterPositions`) and `SeriesMap.tsx`
  (`timelineBookPositions`) — both new standalone helpers in `layout.ts` that
  take an arbitrary ordered list so a candidate order can be previewed without
  mutating the store.
- **Board / map view (freeform)** — drop a card onto another → **confirm dialog**
  → resequence **and** auto-arrange so the change is visible and threads stay
  clean. (Earlier iterations left positions untouched, which read as "nothing
  happened" / left cards stacked — the user asked for the auto-arrange follow-up.)

Key fixes discovered through testing:

- **Threads followed the old order after a reorder.** Chapter connectors are a
  consecutive `chapter[i]→chapter[i+1]` "therefore" chain wired *by id*; reordering
  the array left the chain pointing at the old sequence, so lines crisscrossed.
  There's no board UI to retype chapter links (connectors are plain `<path>`, no
  click handler), so `reorderChapter` now **rebuilds the chain** to follow the new
  order, carrying over any existing type on an adjacency that didn't move. Book
  links (`bookLinks`) are user-drawn labeled connections, not a sequence chain, so
  `reorderBook` leaves them alone.
- **Position updates lagged the connectors during a fast drag.** The board drag
  now coalesces move + hit-test into one `requestAnimationFrame` per frame
  (`pendingDragPos`/`dragRaf`), flushed on mouseup, so card, threads, and the
  drop highlight stay in lockstep.
- **Auto-arrange had lost its character** — `amp = 0.6^arrangeN` decays to 0, so
  repeated arranges snapped to a rigid grid. Floored at `0.15`: it still eases
  toward straight (max tilt ~3.3°→0.5° over clicks) but never lines up perfectly.
- **Book cards weren't grabbable.** Unlike chapter cards (display-only text), book
  cards are almost fully covered by the title `<input>`, premise `<textarea>`,
  status `<select>`, and buttons — the drag guard bailed on all of them, so a real
  click never started a drag ("reorder isn't working in series view"). Added a
  visible **drag-handle grip** (dot grid, grab cursor, "Drag to reorder" tooltip)
  left of each book's number badge; the card cursor is now default so only the
  handle advertises dragging.

New this session:

- **Series auto-arrange** (`layout.ts` `bookAutoArrange` / `bestBookColumns` /
  `fitBooksToContent`; store `autoArrangeSeries` + `seriesArrangeN`): lays books
  on a reading-order grid with slight deterministic jitter, sized to the map
  viewport. `SeriesMap` reports its size via `setBoardSize` and re-fits its camera
  on each arrange (keyed on `seriesArrangeN`). Surfaced as an **"Auto-arrange"**
  toolbar button on the series map, alongside a new **"+ New book"** button
  (mirrors "+ New chapter"; the floating corner button and File-menu →
  `NewBookModal` remain).
- **Highlight** is a soft translucent glow ring (`box-shadow` + `color-mix`), not
  a solid border/outline; the dragged card gets a gentle lift shadow.
- New store actions: `reorderChapter`, `reorderBook`, `autoArrangeSeries`.

Verified in-browser on the sample (8-chapter book + 4-book series): board reorder
resequences `01..08` and re-arranges with clean threads; timeline reorder reflows
live for chapters and books; series auto-arrange grids the books (0 overlaps) and
fits the camera; grip-drag reorders books and repositions freely; repeated
auto-arrange approaches straight but keeps a faint tilt. `tsc -b` + `vite build`
clean (65 modules).

### 2026-07-01 — Series-map cover/grab redesign, timeline scroll, project-list & make-series fixes (Session 18)

Five user-reported fixes, all on the series level plus the project library:

- **Series book card redesigned.** The book **cover moved from the top of the card
  to under the title**, and the number-badge + title row is now the grabbable top
  of the card (`cursor-grab`, kept the dot-grid grip). A set cover now shows
  **Change** / **Remove** controls on hover (`group/cover` + `opacity` transition);
  Remove clears it via `updateBook(id, { coverSrc: undefined })` and the "+ Add
  cover" affordance returns. Previously the cover occupied the top as a
  button/label, so the top wasn't draggable and there was no way to change/delete a
  cover once set (`SeriesMap.tsx`).
- **Series timeline now scrolls like the chapter timeline.** `SeriesMap`'s wheel
  handler previously always zoomed; it now **pans** in timeline view (vertical:
  `panY -= deltaY`; horizontal: `panX -= deltaY+deltaX`) and only zooms on the map,
  mirroring `Board.tsx`. Effect now keys on `[timeline, orient]`.
- **Removed the floating on-canvas "+ New book" button** from the series map; the
  "New book" entry points remain in the toolbar (series-map action) and File →
  `NewBookModal`. Dropped the now-unused `addBook` import in `SeriesMap`.
- **Deleting a project now updates the list immediately.** `ProjectsModal` read the
  project list via the non-reactive `listProjects()` method and only subscribed to
  `doc.id`, so deleting a *stashed* (non-active) project changed `projectStash`
  without re-rendering — the row lingered until a manual refresh. The modal now also
  subscribes to `doc` and `projectStash`, so add/delete/merge re-render at once.
- **"Make this a series" keeps the book's name.** New `makeSeries` store action
  (wired into the File menu, replacing the raw `toggleSeriesMode` call): promoting a
  standalone book copies the current `projectTitle` onto the active (first) book and
  sets the series title to **"Untitled Series"** for the user to rename — instead of
  leaving the story's name on the series and "Untitled Book" on the book.

Verified in-browser on the sample: make-series yields series `Untitled Series` ▸
book `Untitled Voyage`; timeline wheel pans (panY 30 → −670, zoom unchanged); cover
Add/Change/Remove all work under the title; deleting a non-active project removes it
from the list with no reload. `tsc -p tsconfig.app.json --noEmit` clean, no console
errors.

### 2026-07-01 — Full code review + cloud/auth/hosting decisions (Session 19)

Review-only session: no code changed; SPECS.md restructured instead.

- **Decisions locked** (recorded in the new **§8**): Sign in with Google via
  Google OAuth directly (no Supabase/Firebase for auth); storage in the user's
  own Google Drive via a `GoogleDriveStorageAdapter` behind the existing
  `StorageAdapter` seam, `drive.file` scope only; local-first stays as the
  offline cache with a first-login migration offer; web + Android share the
  same identity (Android just needs its own OAuth client ID); free at this
  scale; Drive-native sharing available immediately, real collaboration a
  later adapter. **Hosting**: move from GitHub Pages to Vercel *before*
  privatizing the repo (Pages can't serve from a free private repo; the
  portfolio iframe src updates at cutover; `vite.config.ts` base `/estoria/`
  becomes `/`).
- **Full project review** (store, persistence, lib, all canvases, modals) —
  findings recorded as the prioritized backlog in the new **§9**. Headlines:
  the persistence shim never reads through `StorageAdapter` and double-writes
  every save (blocks any cloud adapter and halves the localStorage budget);
  save failures are silently swallowed while the footer keeps claiming
  autosave; persist re-serializes the entire store (all projects + embedded
  images) on every keystroke; deleting a middle chapter leaves the
  therefore-chain broken; character/world deletes leave dangling ids in
  stashed books; template-insert wipes custom link types; `openDoc` accepts
  unvalidated project files; the import drop zone doesn't actually handle
  drops; project switches can keep a stale camera ("book-1" id collision);
  the import parser treats any `##` heading containing "act" as an Act;
  markdown export drops World entries (hurts the planned Obsidian round-trip).
- **Sequencing agreed**: fix §9 items 1–3 (persistence seam, quota surfacing,
  debounce) → Vercel move → Google OAuth + `GoogleDriveStorageAdapter` (§8),
  with P2 correctness fixes landable independently along the way.
- Doc changes: §2 and roadmap item 7 now point at §8/§9; Session Log renumbered
  to §10.

### 2026-07-01 — Bug-fix batch: §9 items 1–11 (Session 20)

Landed the "fix now" batch from the Session-19 review. §9 items 1–10 are ✅
(item 1's per-project adapter granularity deliberately deferred to the §8
Drive work); item 11 is 🟡 (round-trip fixed, per-book export choice still
open). Remaining open: 12–14 (cursor zoom, image blobs, cosmetics).

- **Persistence rewrite** (`persistence.ts`): reads go through
  `activeAdapter.load()` (async rehydrate — verified no Welcome flash or state
  loss on reload); the double-write is gone and the legacy `estoria:doc:v1`
  duplicate is deleted on first load (reclaims half the quota). Saves are
  **debounced 500ms** with a synchronous flush on `beforeunload` /
  `visibilitychange→hidden`. `save()` errors propagate into a new `SaveStatus`
  pub/sub; the **Footer** now shows the real last-successful-save time,
  "Auto-saving...", or a red "Couldn't save — browser storage is full" (tested
  by making `setItem` throw `QuotaExceededError`: error shows, then recovers).
- **`normalizeDoc()`**: file opens (`readProjectFile`) coerce old/partial
  project files into a complete v3 `StoryDoc` instead of crashing the toolbar.
- **Store fixes** (`useStore.ts`): `deleteChapter` bridges the neighbors
  (carrying the incoming link type) so the therefore-chain never gaps —
  verified: delete ch 4 of 8 → 6 links incl. `c3→c5`, board renumbers 01–07
  with continuous threads; `deleteCharacter` / `deleteWorldEntry` sweep the
  active book **and** all stashed `bookData` books (world deletes now clear
  `worldRefs` at all); `applyTemplate` insert keeps existing link types.
- **Board**: fit-to-content effect keyed on `doc.id` too, so switching between
  projects that share the default `"book-1"` id re-fits the camera.
- **Import modal**: real drag-and-drop (drop zone + whole modal guard) —
  verified with a synthetic DataTransfer drop: parses, shows the summary, no
  navigation. Parser: act headings must *start* with "act" (`## Factions` no
  longer misparsed — verified in the same drop test).
- **Markdown round-trip**: export emits `## World` and full character fields
  in the import schema; parser learned `Desc:`. Verified: export shows
  `- **[[Wren Calloway]]** — Protagonist | Hero` + Desc/Traits/Wants lines and
  a World section; imported doc round-trips `desc`.
- Tooling: `.claude/launch.json` gained `autoPort`; `vite.config.ts` respects
  a `PORT` env (default behavior unchanged for plain `npm run dev`).
- Verified in-browser end-to-end (sample project + import + project switch +
  reload); `tsc -b` + `vite build` clean (65 modules). No console errors.

### 2026-07-01 — One-click backup in the footer (Session 21)

Backing up is now one click instead of File → Export → Save project → rename.

- **New `lib/backup.ts` + Footer controls**: next to the autosave stamp sit a
  **"Back up" button** and a **folder icon**. The folder icon picks (or
  changes) where backups go — `window.showDirectoryPicker` (File System
  Access API), with the `FileSystemDirectoryHandle` remembered in **IndexedDB**
  (handles can't live in localStorage) plus an in-session cache. "Back up"
  writes the current project's JSON straight into that folder with no dialogs;
  if no folder is set yet, the first click prompts for one.
- **Rotation, not overwrite (decided with the user)**: each backup is a
  timestamped `<project>-backup-<YYYYMMDD-HHMMSS>.estoria.json`; the newest
  **5 per project** are kept and older ones pruned (`MAX_BACKUPS` in
  `backup.ts`). Rationale: the working copy is already autosaved, so backups
  exist for disaster recovery — a single overwrite file would let one
  badly-timed click (e.g. backing up after an accidental mass-delete)
  destroy the only good copy. Timestamps sort lexicographically, so the last
  file alphabetically is always the newest.
- **Fallback + failure handling**: browsers without the picker API
  (Firefox/Safari) get a plain download instead and no folder icon. If the
  chosen folder was deleted/moved (`NotFoundError`), the stored handle is
  forgotten so the next click re-prompts. Permission is re-requested when the
  browser drops it. Errors show in the footer ("Backup failed — click the
  folder icon to re-choose"); success shows `Backed up · <file> (n kept)`.
- **Visual confirmation** (user follow-up, same day): on success the button
  itself flashes **"Backed up ✓"** in the therefore-green (border, text, and a
  soft `color-mix` fill) for ~2.6s before returning to "Back up", so success
  is unmissable without reading the detail message; the message stays until
  the next action. Verified mid-flash via computed styles (label + green).
- **Embedded-context fallback** (user report, 2026-07-02): on
  www.labrarf.com the app runs in a **cross-origin iframe**
  (`estoria-app.html` → github.io), where Chromium hard-blocks the File
  System Access pickers — no dialog, SecurityError, and **no
  Permissions-Policy `allow` token exists to delegate it** (unlike
  clipboard). The user wants the labrarf.com wrapper kept, so the fix is
  in-app: `isBackupPickerSupported()` also checks for a cross-origin frame
  (folder icon hidden, "Back up" = download), plus a runtime SecurityError
  catch that flips to the download fallback for any undetected embedder.
  Verified: with a SecurityError-throwing picker, Back up downloads, flashes
  ✓, shows "Backup downloaded (check your browser's Downloads)".
- **System-folder refusal** (same report): opened directly, Chrome refuses
  system-adjacent picks (home root, Library, drive roots) with its
  "contains system files" dialog — not overridable. Mitigation: the picker
  now opens with `startIn: "documents"`, and an abandoned pick shows a tip
  ("pick or create a normal folder like Documents/Estoria Backups"). Also
  swept em dashes out of the new footer strings per the UI-chrome rule.

### 2026-07-02 — Same-origin embed: full backups on labrarf.com (Session 22)

The download fallback wasn't enough (no folder choice, no rotation) and the
user wants the labrarf.com URL kept — so the embed itself moved same-origin.

- **New `npm run sync:portfolio`**: builds and rsyncs `dist/` →
  `Portfolio-Website/estoria/` (the portfolio repo serves it at
  `www.labrarf.com/estoria/`; prod base is already `/estoria/`, so the same
  build works unchanged). Portfolio's `estoria-app.html` iframe now points at
  `/estoria/` — same origin as the page, so Chromium allows the folder picker
  inside the embed: **folder backups + 5-file rotation now work on
  labrarf.com**. The cross-origin download fallback stays as a safety net for
  any other embedder.
- Verified with a local static server on the portfolio root: the iframe is
  same-origin (`contentDocument` reachable), the app boots from `/estoria/`,
  and the footer shows both "Back up" and the folder icon (hidden in the old
  cross-origin embed). The picker dialog itself needs a real user gesture, so
  that part is user-verified on the live site.
- **Caveat (accepted)**: localStorage is per origin, so the embed's stored
  projects reset once on the origin switch; recovery is Export at the old
  URL → Open file at the new one.
- **Plan impact** (§8 updated): privatizing the estoria repo no longer waits
  on Vercel — the demo now ships from the public portfolio repo as build
  output. Also added a `portfolio-static` launch config for verifying the
  embed locally.
- SITE-GUIDE.md (portfolio repo) updated in step: sections 2/4/5/10 + session
  log. Both repos pushed.
- Verified in-browser: controls render with correct tooltips; with a stubbed
  directory handle, 7 backups → exactly 5 files kept (oldest 2 pruned), each
  ~13.5 KB of real doc JSON, footer reports `(5 kept)`; removing
  `showDirectoryPicker` flips the button to the download fallback ("Backup
  downloaded") and hides the folder icon. `tsc -b` + `vite build` clean
  (66 modules), no console errors. (The OS folder picker itself can't be
  driven headlessly — first real click will show it once.)
