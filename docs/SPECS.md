# Estoria — Specs

> Living document. This is the source of truth for what Estoria **is**, how it's
> built, and why — the current state, not the history. **Read this first.**
>
> Update it in the same session a decision is made or a feature lands: §4 for
> feature status, §9 for the fix backlog. The dated record of what happened when
> lives in [`SESSIONS.md`](SESSIONS.md) — appending there is not a substitute for
> updating the section above that the change made stale.

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
  **Click a card to open it** (drag still drags; a press that doesn't move is a
  click).
- **Scene** — a beat inside a chapter. Consecutive scenes are joined by a
  **connector** typed `therefore` (causal), `but` (conflict), or `and` (parallel).
- **Chapter link** — a connector between two chapters on the board, same 3 types.
- **Character / World entry** — rich reference records.
- **Asset** — a shared, book-level **note, image or to-do list** in one pool,
  linkable ("pinned") into any number of chapters and world entries. Each surface
  keeps its **own pin order**, independent of the library's order. An asset can be
  **archived**: unpinned everywhere and retired from the library, restorable.
- **Series** — optional multi-book planning layer above the current book, with its
  own story-map (books as cards) and timeline. Navigated via a header breadcrumb.
- **Draft / version** — **per book**: each book has its own named versions, and
  each version is a **standalone fork** of the whole board (chapters, scenes,
  connectors, statuses, notes, layout). Creating a version deep-copies the
  current one; edits never leak between versions. The series bible (characters/
  world/assets) stays shared. The version selector is hidden on the series map.
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
The seam is ready for it: since Session 20 both reads and writes go through
`activeAdapter` (async rehydrate, single debounced write path, save failures
surfaced in the footer). Still to do before a Drive adapter: widen
`StorageAdapter` to per-project granularity (§9 item 1).

---

## 3. Project layout

```
estoria/
├─ index.html                 # Vite entry, loads Google Fonts
├─ vite.config.ts             # React + Tailwind plugins, "@/" alias, build-info +
│                             #   version.json plugins (§ Session 42)
├─ tsconfig*.json             # app + node TS projects
├─ scripts/deploy.sh          # `npm run deploy`: build → portfolio repo → verify live
├─ docs/SPECS.md              # ← you are here: current state, §§1-9
├─ docs/SESSIONS.md           # dated session log (history; §N refs point here)
├─ docs/archives/            # closed records — read for background, don't work from
│  └─ REVIEW-FINDINGS.md     #   3 code reviews + 1 task brief, all items closed
├─ Story Mapping WebApp Prototype/   # design reference (not built on)
└─ src/
   ├─ main.tsx                # React root
   ├─ App.tsx                 # layout: Toolbar + Board + Footer + overlays; theme effect
   ├─ index.css               # Tailwind import + design tokens (@theme)
   ├─ types.ts                # StoryDoc and all model types  ← single source of truth
   ├─ vite-env.d.ts           # Window.__ESTORIA_BUILD__ typing
   ├─ data/
   │  ├─ sampleStory.ts       # "The Drowned Map" default document
   │  └─ emptyStory.ts        # blank document for a new project
   ├─ store/
   │  ├─ useStore.ts          # Zustand store: doc + UI state + all actions
   │  └─ persistence.ts       # StorageAdapter, debounced storage shim, normalizeDoc,
   │                          #   save-status pub/sub, file save/load
   ├─ lib/
   │  ├─ layout.ts            # board/timeline layout, auto-arrange, fit-to-content
   │  ├─ markdown.ts          # export builder, import prompt + parser
   │  ├─ templates.ts         # story-structure skeletons (30 cards, 3 facets)
   │  ├─ sync.ts              # cross-app sync: fingerprint, 3-way compare, file history
   │  ├─ backup.ts            # folder handle + rotating backups (File System Access)
   │  ├─ drafts.ts            # version-fork helpers (clone/stash a board)
   │  ├─ entities.ts          # character/world lookup helpers
   │  ├─ refs.ts              # asset-backed pinned-ref resolution (asset-backed
   │  │                       #   since v5; resolves to-do `items` too), link
   │  │                       #   counting, `findAssetPins` (every place an asset is
   │  │                       #   pinned, across books + versions)
   │  ├─ prune.ts             # sweep records left with no content in them
   │  ├─ ids.ts               # uid() — shared by the store and draft records
   │  └─ files.ts             # file → data URL reading
   └─ components/
      ├─ Toolbar.tsx          # identity/rename, File menu, view + version controls
      ├─ Board.tsx            # canvas: pan/zoom/drag, cards, connectors, timeline
      ├─ SeriesMap.tsx        # series-level board: book cards + links
      ├─ ChapterDetail.tsx    # chapter modal: scene flow + act controls
      ├─ Footer.tsx           # autosave status, Sync button, folder icon
      ├─ SyncHistoryPopover.tsx / SyncFileList.tsx   # file history + restore
      ├─ Welcome.tsx · Lightbox.tsx · ConfirmDialog.tsx
      ├─ ui/                  # Overlay (Scrim/Drawer/SizeButton/CloseButton/stop),
      │                       #   Popover, RefList, ViewToggle, ExpandableTextarea,
      │                       #   AssetLinkPicker
      ├─ panels/              # CharactersPanel, WorldPanel, NotesPanel — modal
      │                       #   `Drawer`s, one at a time (§4 "Panel sizes")
      └─ modals/              # Export, Import, Templates, Projects, NewBook,
                              #   Backups, SyncConflict, About
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
| Board | Pan / zoom / drag cards | ✅ | Wheel zooms; drag rearranges; **a click opens the chapter** (board + timeline) — a press that moves is a drag, a press that doesn't is a click, and a click that jiggled puts the card back. The chapter modal ignores backdrop dismissals for 400ms after opening so the old double-click habit can't close it on the way in. |
| Board | Reorder chapters | ✅ | Board: drop a card on another → confirm → resequences **and** auto-arranges so threads stay clean. Timeline: drag to reorder with live reflow. Connector chain rebuilt to follow the new order. |
| Board | Connectors (therefore/but/and) | ✅ | SVG curves, colored by type, per-version (each version forks its own links). |
| Board | Auto-arrange | ✅ | Decaying-jitter grid, floored so it approaches straight but never a rigid lattice. |
| Board | Add chapter | ✅ | |
| Timeline | Vertical / horizontal layout | 🟡 | Layout + scroll-pan work; fit-to-view on switch not yet wired. |
| Detail | Scene flow canvas | ✅ | Drag-to-reorder scene nodes (live grid preview + edge auto-scroll), long-press Add scene to drop it in place, SVG connectors, click pill to cycle therefore/but/and, add/edit/delete scene, auto-arrange, **move selected scenes to another chapter** (Beginning/Middle/End). |
| Detail | Scene layout remembered per canvas size | ✅ | The expanded and collapsed canvases fit different column counts, so each keeps **its own layout** (`scenePos` / `scenePosCompact`, v6). Toggling size swaps layouts instead of re-arranging — which is what used to throw the arrangement away. Auto-arrange tidies only the size you're looking at; structural edits keep both in step. |
| Board | Card meta redesign | ✅ | Bottom row reads "N scenes · N.Nk words"; character avatars moved to the top-right; pinned-notes count dropped (board + timeline). |
| Detail | Edit title / summary / status | ✅ | Inline; status picker Idea/Draft/Done. |
| Detail | Act +/- controls | ✅ | |
| Detail | Pinned refs | ✅ | Add/link/rename/delete note, image + to-do refs; asset-backed since v5. Content edits write through the store (`updateChapterRefAsset` / `updateWorldRefAsset`) rather than a caller-resolved `updateAsset` — resolving `refId → asset` from a render closure dropped keystrokes typed in the moments right after a draft committed. |
| App | Reorder pinned resources | ✅ | Grip-drag rows (pointer-based, like every other drag in the app) **or type a position number** — in the shared library, on a chapter, and on a world entry. Each surface owns its order: `reorderAsset` (counts non-archived, leaves archived slots alone) / `reorderChapterRef` / `reorderWorldRef`. |
| Notes | Where a note is pinned + jump | ✅ | Expanding a library item lists every pin as a button, in the same compact form as a character's "Appears in" — just `Ch N ↗`, with the chapter name in the tooltip. Pins outside the loaded board are **grouped** under one small "Book · Version" heading rather than repeating the location on each chip. Clicking switches book and version through the normal stashing actions, closes the panel and opens the chapter (`jumpToChapter`); world pins sit under a "World" heading and open the World panel on that entry (`jumpToWorldEntry`). Data from `findAssetPins`. |
| Notes | Archive / restore | ✅ | Archiving **unpins everywhere first** (same five-location sweep as delete), then flags `archived` — so an archived asset is attached to nothing. Hidden from the library and the link picker, listed under "Archived · N" with Restore (comes back unpinned; the confirm says so before you commit) and a plain Delete. |
| Notes | To-do lists as a pinnable resource | ✅ | Schema v6 `TODO` asset with `items[{id,text,done}]`: checkboxes, add/remove tasks, Enter adds the next one, "N/M done" in the row and library caption, pinnable into chapters and world entries like a note. Exported as real markdown checkboxes (`- [x]`), blank lines omitted. The add row reads **+ Note · + To-do · + Image** everywhere `RefList` appears. |
| App | Remove vs. delete | ✅ | Session 47b: one meaning per control — an **✕ detaches** (chip off a chapter, note unpinned from a chapter/world entry; confirm button says "Remove"), a **labelled button destroys** — "Delete character", "Delete entry", and plain "Delete" in the shared library, where the confirm is what names the blast radius: "Delete this note everywhere?". `RefList`'s `removeMode` prop picks which affordance a list gets; only the library passes `destroy`. |
| App | Nothing saved until typed | ✅ | Session 47: "+ Add character / world entry / Note / To-do / Image" open a **draft** card that isn't in `doc` (a to-do counts as typed on its title *or* a task's text) — the record is created by the first keystroke (`charDraft`/`worldDraft` in the store; `RefList`'s own draft row). So a blank record is never saved, listed or castable. `lib/prune.ts` sweeps records *emptied later* (and pre-existing blanks) on the same panel/modal close, clearing their ids from every chapter. |
| Characters | List + expand detail | ✅ | |
| Characters | Add / inline edit | ✅ | "+ Add character" opens a blank **draft** card; the character exists once you type (Session 47, superseding Session 27's "new entries start empty"). Every field editable in the panel. |
| World | List + expand detail | ✅ | |
| World | Add / edit / refs | ✅ | Name/category/desc/notes inline; refs via the shared `RefList`. |
| Notes | Story notes editor | ✅ | Auto-saved, in export. |
| Templates | Insert / replace skeletons | ✅ | 29 structures + blank starter (30 template cards), every structure carrying per-chapter writing prompts; incl. 9 life-story arcs and 10 genre beat sheets; facet filter bar. |
| Import | AI prompt + markdown parse | ✅ | Prompt copy, drop-to-parse, summary card, opens as a new project. Parser tolerates AI drift (Session 43). Validation still only errors on 0 chapters. |
| Export | Markdown (Obsidian) | ✅ | Copy + download. |
| Export | Project file (.json) | ✅ | Save + "Open file…" in the Projects modal (Session 9). |
| Series | Planner view + mode toggle | ✅ | Book cards editable in place (title, premise, status, cover, link labels). |
| Series | Add book / reorder / auto-arrange | ✅ | Toolbar "+ New book" and "Auto-arrange" (series map only). Reorder via grip handle: map drop → confirm → resequence + re-arrange; timeline drag → live reflow. |
| App | Panel sizes | ✅ | Characters / World / Notes render through the shared **`Drawer`** in two sizes, toggled by an Expand/Collapse button and remembered (`panelExpanded`): **side panel** — the 460px right-hand column behind the usual dimmed `Scrim`, so the app behind it is greyed out and inert and a backdrop click closes it; **full screen** — the same panel filling the viewport, content capped at 1180px and centred. |
| App | One panel at a time | ✅ | The scrim covers the toolbar, so a second panel is unreachable by pointer — a click there closes the open one instead. `setPanel` also enforces it in state for the paths that open a panel from *inside* another surface (a draft started from the chapter modal, a note's world-pin jump), and re-opening the panel you're already in deliberately does **not** sweep the draft you're typing into. |
| Characters / World | Appears in → jump to chapter | ✅ | A character's "Appears in" chips, and a matching list on world entries, are buttons: clicking closes the panel and opens that chapter (`jumpToChapter`). Scoped to the loaded board, matching the "in N chapters" line above them — unlike a note's pin list, which spans books and versions because the asset library does. |
| App | Light/dark theme | ✅ | |
| App | Drafts (main/alt) | ✅ | Standalone forks since v4 (2026-07-17): toggle swaps the whole board (chapters/scenes/links/notes); add = deep copy of the current version. |
| Persist | Local auto-save | ✅ | Via zustand persist → LocalStorageAdapter (debounced; failures surfaced in footer). |
| Persist | Cross-app Sync + rotating backups | ✅ | Footer "Sync" + folder icon (File System Access API). Reconciles with `<slug>.estoria.json` in the Estoria folder (shared with the Android app), writes a timestamped backup on every sync (newest 5 kept), auto-mirrors auto-saves into the file (fast-forward only). Folder icon opens the file history popover (live/backup/conflict badges) with undoable per-file Restore. Hidden on Firefox/Safari/embeds (no folder API there — local auto-save + export menus only). Replaced the "Back up" button 2026-07-03; see §8. |
| Persist | Project / book renaming | ✅ | `EditableName` in the toolbar identity line — series ▸ book breadcrumb, both editable. |
| App | Version / build stamp | ✅ | About shows `v… · build N · sha · time` from `window.__ESTORIA_BUILD__`; `npm run deploy` verifies the commit is live (Sessions 41–42). |

---

## 5. How to run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build to dist/
npm run typecheck  # types only
npm run preview    # serve the production build
npm run deploy     # build + publish to www.labrarf.com/estoria, then verify it's live
```

`deploy` refuses a dirty tree — commit first, so the SHA prod reports is real.
See §8 "Deploy runbook".

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

> **Cross-project note — an Android companion app is planned (not built here).**
> A **separate** native Kotlin/Compose app is planned (decided 2026-07-02); its
> own spec lives at `/Users/rfcl/AndroidStudioProjects/Estoria-aa/ESTORIA-ANDROID.md`.
> **It is not part of this repo's roadmap and does not add web work** — it is
> listed here only so web-side changes stay aware of it. What that awareness
> means in practice:
> - The Android app reads/writes the **same `.estoria.json` (currently schema
>   v6 — see `SCHEMA_VERSION` in `src/types.ts`; v4 = standalone version forks,
>   v5 = asset-backed pinned refs, v6 = `TODO` assets + `archived` + per-mode
>   scene layout)**. Any
>   change to the document model here is a **cross-app compatibility event** —
>   coordinate schema bumps, don't silently reshape `StoryDoc`.
> - **⚠️ OPEN CROSS-APP EVENT — v6 (2026-07-26).** The web app now writes schema
>   6. An app that reads up to v5 must refuse a v6 file rather than drop what it
>   doesn't understand (that's what `SchemaTooNewError` is for here), so **until
>   the Android side is updated it will decline files this app has written** and
>   cross-app Sync is effectively one-directional. What v6 adds, all additive:
>   `Asset.kind` gains `"TODO"` with `items: [{ id, text, done }]`;
>   `Asset.archived?: boolean` (an archived asset is unpinned everywhere by
>   construction, so a reader can treat it as library-hidden and nothing else);
>   `Chapter.scenePosCompact?: Vec2[]`, the collapsed-canvas twin of `scenePos`
>   (safe to ignore, or to mirror if the phone ever grows two canvas sizes). An
>   unknown `kind` should degrade to a note, which is what `normalizeAssets` in
>   `store/persistence.ts` does here.
> - The planned Google sign-in + Drive work (§8) is intended to be **shared** by
>   both apps (same Google identity, one Drive file). Decisions made for the web
>   OAuth/Drive setup should not preclude a second (Android) OAuth client under
>   the same Google Cloud project.
> - A future multi-user backend would be a **new adapter behind the existing
>   seam** for both apps — a reason to keep the `StorageAdapter` seam clean.

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

### Cross-app Sync — CONTRACT SETTLED 2026-07-03 (both sides built; web behavior extended same day, see below)

Designed with the user in the Android session of 2026-07-03; the Android app
implements its half (see the Android spec §8, same-day session log), and the
web half shipped later the same day (Session 24). **The contract:**

- **One canonical file per project.** In the user's Estoria folder (their
  Google Drive folder, reached from this app via the remembered
  File System Access directory handle — same handle `lib/backup.ts` uses),
  each project has ONE stable-named working file: `<slug>.estoria.json`.
  Both apps' Sync read/write that file. The timestamped
  `<slug>-backup-<stamp>.estoria.json` rotation stays as the safety net.
  Rationale: Android's file picker cannot grant *folder* access on Google
  Drive (no `ACTION_OPEN_DOCUMENT_TREE` support in Drive's provider), so the
  phone can only watch a single file — and `drive.file`-scoped API access
  wouldn't see desktop-synced backups anyway.
- **Change detection = per-device content fingerprint + `modifiedAt`.**
  Each device remembers a hash of the state it last agreed on with the file
  (web: localStorage/IDB alongside the dir handle). Compare:
  local == remote → in sync; remote == last-synced → local ahead (offer
  write); local == last-synced → remote ahead (offer reload); else →
  conflict. Android hashes SHA-256 over the codec-canonical encoding with
  `modifiedAt` stripped; the web side must likewise hash a canonical,
  `modifiedAt`-less serialization of its own (the two hashes never cross the
  app boundary, so they don't need to match each other — each device only
  compares its own).
- **`modifiedAt` (ISO 8601) is now an optional v3 top-level field.** Stamped
  on every file write, used for "file last written …" display only — never
  for conflict logic (clock skew). The Android model declares it;
  **`normalizeDoc` here must preserve it** (and ideally stamp it in the
  save-to-file/backup paths).
- **Conflicts (v1): whole-file choice + diff summary, loser preserved.**
  Show what differs (entities matched by stable ids, neutral phrasing),
  user picks keep-mine/keep-theirs; the copy NOT kept is written as
  `<slug>-conflict-<stamp>.estoria.json` (web: into the Estoria folder;
  Android: stashed in app storage, exportable) so it can never override the
  canonical file and can be merged manually later. Per-entity merge by ids
  remains the later evolution.
- **Check cadence:** on open/focus + a user-set foreground interval
  (Android default 5 min; suggest mirroring), prompting to review — never
  auto-applying.
- Relation to the §8 Drive adapter: unchanged — the adapter is transport,
  Sync is the reconciliation policy on top, and it works today over the
  File System Access folder without Drive sign-in.

**Web implementation (Session 24, 2026-07-03) — DONE, with user-decided
extensions that go beyond the original to-do.** The web behavior is now:

- **The footer "Back up" button is gone; Sync absorbed it.** Every completed
  explicit Sync (including "already in sync" and conflict resolutions) writes
  one timestamped `<slug>-backup-<stamp>.estoria.json` and prunes to the
  newest 5 — the old Back up rotation, now a side effect of Sync. Backups are
  NOT written by the background mirror (below), so a long editing session
  can't churn out the 5 good copies.
- **Auto-save mirrors into the canonical file.** Local auto-save (localStorage
  via the `StorageAdapter` seam) stays the always-working base; ~2.5s after a
  save settles, the state is also pushed to `<slug>.estoria.json` — but ONLY
  as a pure fast-forward (file absent / identical / unchanged since
  last-synced). If the file moved on its own, the mirror never writes; the
  autosave line flips to "file changed elsewhere — press Sync". Effectively
  auto-sync with manual conflict review.
- **No footer button where folder access doesn't exist** (Firefox/Safari, the
  labrarf.com cross-origin embed): user decision — those contexts keep local
  auto-save and the export menus only. No download fallback on Sync.
- **Folder icon = file history + restore** (added later in Session 24, user
  decision). With a folder set, clicking the footer folder icon opens a
  popover listing this project's files in the Estoria folder with role badges
  — **Live file** (the no-suffix `<slug>.estoria.json` sync target),
  **Backup** (`-backup-<stamp>`, rotation copies), **Conflict copy**
  (`-conflict-<stamp>`) — each with its written time and a **Restore**
  action. Restore (after a confirm) replaces only the *working copy*; the
  current state is first written as a new rotating backup, so every restore
  is undoable from the same list. The live file is deliberately left alone —
  the mirror/Sync path updates it afterwards with the usual never-clobber
  guarantees, so restoring can still surface a conflict instead of silently
  overwriting a phone-side change. "Change…" in the popover re-picks the
  folder (`SyncHistoryPopover.tsx`; `listProjectFiles`/`restoreFromFile` in
  `lib/sync.ts`; `Popover` grew a `side="above"` mode for bottom anchors).
- Implementation: `lib/sync.ts` (fingerprint = SHA-256 over key-sorted,
  `modifiedAt`-stripped JSON of the `normalizeDoc`-normalized doc; three-way
  compare; conflict copies; all folder ops serialized through one lock so the
  mirror and a Sync click can't interleave), `lib/backup.ts` (folder handle +
  `writeRotatingBackup`, `backupProject` removed), `SyncConflictModal`,
  footer wiring in `Footer.tsx` (focus + 5-min notify-only check per the
  cadence bullet). `modifiedAt` stamped by `stampModified()` on every file
  write incl. exports; preserved through `normalizeDoc`.
- **Android follow-up (user's plan, not web work):** mirror the same extended
  behavior on the phone — sync-writes-backup-rotation and auto-mirror. The
  file contract above is unchanged by these extensions (rotation and mirrors
  are device-local behavior), so nothing breaks while Android catches up.

### Hosting migration (updated 2026-07-02 — see Session 22)

- **The embed is now a same-origin copy.** The built app is synced into the
  portfolio repo (`Portfolio-Website/estoria/`, via `npm run deploy` — the old
  `sync:portfolio` script it replaced in Session 42)
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

#### Deploy runbook — `npm run deploy` (updated Session 42)

Publishing is still **two repos**, but `scripts/deploy.sh` now drives the whole
loop and verifies the result, so the manual steps below are only what it does
under the hood (and what to fall back on when Pages misbehaves):

1. Refuse a dirty tree — commit and push the source repo first, so the SHA
   stamped into the build is a real commit.
2. `npm run build` — stamps `window.__ESTORIA_BUILD__` + writes
   `dist/version.json`.
3. `rsync -a --delete dist/ → Portfolio-Website/estoria/`, then commit + push
   the **portfolio** repo. That push triggers its `pages-build-deployment`
   Action, which is what actually publishes `www.labrarf.com/estoria/`.
4. Poll `…/estoria/version.json` (cache-busted) for up to ~5 min until prod
   reports HEAD's commit → `✓ <sha> is live`. A timeout means Pages is still
   building; re-run to re-check.

Step 4 is the point of the script — it replaces the old "compare asset hashes
by hand" check below, which stays here as the manual fallback:

- **The rsync uses `--delete`**, so it removes the old
  content-hashed `assets/index-*.{js,css}` and writes new ones. If the Pages
  deploy then fails or stalls, Pages keeps serving the **last successful**
  (old) build — so the site looks unchanged even though the repo is correct.
  This is the trap: a green push does **not** mean a green deploy.
- **Always confirm the deploy landed**, don't assume. Quick checks:
  - `gh run list --limit 3` in the portfolio repo — the newest
    `pages build and deployment` must be `completed / success`, not
    `failure`/stuck `queued`.
  - Compare hashes: `grep -o 'index-[^"]*\.\(js\|css\)'
    Portfolio-Website/estoria/index.html` vs
    `curl -s "https://www.labrarf.com/estoria/index.html?cb=$(date +%s)" |
    grep -o 'index-[^"]*\.\(js\|css\)'` — they must match. (Cache-bust the
    query string; hashed asset names already bust their own caches.)
- **If the deploy failed or is stuck** (seen 2026-07-04: transient
  "Deployment failed, try again later", and a `gh run rerun --failed` that then
  hung `queued` ~6 min): don't wait on the rerun. Push a fresh **empty** commit
  to the portfolio repo (`git commit --allow-empty -m "Redeploy Pages"`) to
  kick a clean build+deploy, then re-verify hashes. It's almost always a
  GitHub-side hiccup, not a content problem — the built artifact is fine.

---

## 9. Known issues & fix backlog (code review, 2026-07-01)

Full-project review (store, persistence, layout, markdown, board/series/detail
components, modals). Ordered by priority. Check items off here as they land,
with an entry in [`SESSIONS.md`](SESSIONS.md).

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
5. ✅ **Fixed 2026-07-01 (Session 20)**; **re-fixed 2026-07-18 (Session 40)**
   — Session 20's sweep only covered `chapters` + `bookData[*].chapters`;
   schema v4 (Session 36b established `draftData` version forks) added two more
   chapter locations that were never swept. See Session 40 in
   [`SESSIONS.md`](SESSIONS.md). Both
   deletes now sweep the active book's chapters *and* every stashed
   `bookData[*]` book, in both the active version and every `draftData[*]`
   fork; world deletes clear `worldRefs` too. *Original finding:*
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
14. **Perf (cosmetic)**: `ChapterDetail` subscribes to the whole `doc`
    (every keystroke re-renders the full modal — fine at current scale, use
    narrower selectors if it ever feels sluggish).
    *(The other half of this item — "delete-chapter confirm shows the base
    `ch.title` rather than the draft-resolved title" — is moot since schema v4
    (Session 36b): versions are standalone forks, so `ch.title` **is** the
    active version's title. No override layer left to resolve.)*

