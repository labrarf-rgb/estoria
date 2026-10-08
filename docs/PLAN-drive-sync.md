# Plan: Sync with Google Drive — APPROVED, NOT STARTED

> **Status (2026-10-07):** plan approved by the user in Session 64. No code
> written yet. Linked from SPECS §6 item 7 ("NEXT UP").
>
> **Where to start in a new session:**
> 1. Ask the user whether they have finished **Step 0** (Google Cloud setup) and
>    for the three values: OAuth **Client ID**, **API key**, **project number**.
>    Never ask for the client secret; it is not needed.
> 2. Step 2 (the `SyncFolder` refactor) does not need Google and can be built
>    first while the user finishes Step 0.
> 3. Process the user expects: build, verify in the browser pane, then the user
>    tests locally; commit / push / deploy only on their go-ahead.
>
> **Step 0 walkthrough already given to the user** (console.cloud.google.com,
> signed in with the account they will sync with):
> 1. New project `Estoria`.
> 2. APIs & Services → Library → enable **Google Drive API** and **Google Picker API**.
> 3. OAuth consent screen (may be "Google Auth Platform → Branding"): External,
>    app name `Estoria`, their email as support/contact, **no logo**; scopes:
>    only `.../auth/drive.file`; Audience → **In production**. Home page and
>    privacy policy links left blank until `privacy.html` exists.
> 4. Credentials → OAuth client ID → Web application; Authorized JavaScript
>    origins `https://www.labrarf.com`, `https://labrarf.com`,
>    `http://localhost:5173`; no redirect URIs.
> 5. Credentials → API key → restrict to Websites (`https://www.labrarf.com/*`,
>    `https://labrarf.com/*`, `http://localhost:5173/*`) and to the Google Picker API.
> 6. Project number from the Dashboard.

---


## Context

Today, cross-device Sync only works in desktop Chrome/Edge, because it writes to a folder through the browser's folder API. Safari (so every iPad browser) and Firefox have no Sync at all: your work lives only in that browser. The goal is for those browsers to sync too, using the same files the Mac and Android app already share.

**Decided with you:**
- **Drive permission:** `drive.file`. Estoria sees only the files it creates or that you pick for it once. There's no "unverified app" warning, and anyone could use it later.
- **Sign-in address:** stay on `https://www.labrarf.com` (also `labrarf.com`), plus `http://localhost:5173` for testing. Hosting doesn't change.
- **From SPECS §8:**
  - Google sign-in directly (Google Identity Services), with no extra backend.
  - Local-first stays.
  - The Drive file is the same `<slug>.estoria.json` the Android app already reads.

**The key design choice: Drive becomes a second kind of "Estoria folder" under the existing Sync, not a new storage layer.** The current Sync (`lib/sync.ts`) already does exactly what Drive needs:
- the three-way compare (only you changed, only the file changed, or both changed);
- conflict copies and per-item merge;
- rotating backups, file history and restore;
- the auto-mirror after saves;
- the 5-minute "file changed elsewhere" check.

All of it only needs four folder operations: read a file, write a file, list files, delete a file. If those sit behind one small interface, Drive gets everything for free and the Android file contract is untouched. (A `StorageAdapter` for Drive would instead overwrite the file every 500ms with no conflict detection. That's wrong for a file your phone also edits.)

## How this works for someone other than you

- **Without Drive, nothing changes.** Anyone can open labrarf.com/estoria and use it as today, with no account; projects stay in their browser.
- **"Connect to Google Drive" signs them in with their own Google account**, and Google asks them to allow Estoria to use files it creates. Their projects go into an Estoria folder in their own Drive and count against their own Drive storage. Each person only ever sees their own files.
- **There is no Estoria server.** The browser talks to Google directly, so their writing never passes through labrarf.com. You can't see their data, and there's nothing to host, secure or pay for.
- **Cost:** the Drive API is free. All users share your Google Cloud project's API quota, which is far beyond what this needs, and more can be requested if Estoria ever gets big.
- **Google's requirements for public use** (part of Step 0):
  - the consent screen set to "In production";
  - a home page link (labrarf.com/estoria);
  - a short privacy policy page. One sentence covers it: "Estoria stores your projects in your browser and, if you connect it, in your own Google Drive; nothing is sent to us."

  `drive.file` needs no Google security review. A custom logo on the consent screen would need a light brand check, so we skip the logo.
- **Their Android app:** the Android app reads the same file through Android's file picker, so it works for them too.

## Step 0: Google setup (you, with me walking you through it)

In Google Cloud Console:
1. Create a project, called "Estoria".
2. Enable the Google Drive API and the Google Picker API.
3. Set up the OAuth consent screen: External, app name Estoria, and scope `drive.file` only. "In production" status is fine, because `drive.file` needs no verification.
4. Create an OAuth client ID of type Web application. Authorized JavaScript origins:
   - `https://www.labrarf.com`
   - `https://labrarf.com`
   - `http://localhost:5173`
5. Create an API key (the Picker needs one), restricted to the Picker API and to those three origins as referrers.
6. Add a home page link and a privacy policy page to the consent screen. I'll write the page as `privacy.html` and serve it beside the app.
7. Note the project number (the Picker's "app ID").

You give me the client ID, the API key and the project number. All three are public values that ship in the page by design. They go in `src/lib/driveConfig.ts`. If they're empty, the Drive option simply doesn't appear.

## Step 1: Day-one check against real Drive, before building UI

`drive.file` has two behaviors I couldn't confirm from Google's documentation, and the first-connect flow depends on them. I'll test each with your client ID and a scratch folder:
- **Picking the folder:** if you pick only the Estoria folder in the Picker, can Estoria then list and read the files already inside it, or only create new ones there?
- **Mac rewrites:** when the Mac writes a project file through the Drive desktop app, does Drive keep the same file ID? If the desktop app replaces the file instead, an iPad that was given access to the old file loses sight of the new one.
- **Android writes:** do the Android app's writes keep the file ID too? (I expect yes, since they update in place.)

The plan below is designed for the worst case of each, so the results only simplify it. If Mac rewrites do change the ID, the recommendation becomes: once Drive is connected, use Drive mode on the Mac too, not the folder.

## Step 2: Put a folder interface under Sync (no behavior change)

- **New `src/lib/syncFolder.ts`:**
  - `interface SyncFolder { name; read(fileName) → text | null; write(fileName, text); list() → {name, lastModified}[]; remove(fileName) }`
  - `LocalFolder` wraps today's `BackupDirHandle`. It moves the existing `getFileHandle` / `createWritable` / `values` / `removeEntry` calls out of `sync.ts` and `backup.ts`.
- **`lib/sync.ts`:** `readCanonical`, `writeDoc`, `listProjectFiles` and `restoreFromFile` take a `SyncFolder`. `syncProject`, `resolveConflict`, `pushCanonicalIfSafe` and `checkRemoteChanged` get their folder from a single `getSyncFolder({ interactive })`. Not changing:
  - the `locked()` operation chain;
  - the fingerprint;
  - the last-agreed hash;
  - `diffDocs` and `merge.ts`.
- **`lib/backup.ts`:** `writeRotatingBackup` and `writeSavedCopyFile` write through the `SyncFolder`. The folder-handle remembering stays here, used by `LocalFolder`.

Desktop Chrome with a folder must behave exactly as today. I'll check that first, before any Drive code exists.

## Step 3: Drive client and DriveFolder

**New `src/lib/drive.ts`:**
- **Loading:** loads Google's sign-in script (`accounts.google.com/gsi/client`) and the Picker (`apis.google.com/js/api.js`) only when you connect, never on page load.
- **Token:** sign-in uses the Google Identity Services token flow. The access token lasts about an hour, is held in memory and never written to storage, and is refreshed silently on your next click (`prompt: ''`).
  - **Background steps never open a popup.** Safari blocks popups that aren't from a click. Without a valid token, the background mirror and check do nothing, just as today without folder permission. The footer then says Drive needs reconnecting, and one click reconnects.
- **REST calls (Drive API v3, `fetch`):**
  - `files.list`, filtered by parent folder, file name and not trashed;
  - downloading a file (`alt=media`);
  - creating a file (multipart upload);
  - updating a file's content (`PATCH` media upload);
  - deleting a file, used only for pruning Estoria's own backups.
- **`DriveFolder implements SyncFolder`.** It caches file name → file ID. It also remembers, on this device, the file ID each project last synced with (`estoria:drive:file:<projectId>`).
  - **Guard against duplicate files:** if that remembered file is gone or trashed, it **does not** create a new file with the same name. Sync reports "can't see this project's file any more" and offers the Picker to pick it again. This is the worst case from Step 1.
- **First connect (Picker):**
  - **If you already have an Estoria folder in Drive:** pick that folder plus your existing `*.estoria.json` files. The Picker shows folders and `.estoria.json` files, with multi-select.
  - **If you don't:** Estoria creates a folder named "Estoria".
  - The folder ID and name are stored in `estoria:drive:v1`.

## Step 4: Choosing where to sync, per device

- **New `src/lib/syncTarget.ts`:**
  - Each device has an active target: `"folder"`, `"drive"`, or none, stored in localStorage.
  - `getSyncFolder()` returns the matching `SyncFolder` or null.
  - What's available:
    - Safari and Firefox (including iPad): Drive only.
    - Desktop Chrome: both, and you choose.
    - Embedded frames: unchanged.
- **Footer (`Footer.tsx`):**
  - The Sync button and folder icon appear when either target is possible. Today they're hidden whenever folder access is missing.
  - The first Sync opens a small "Sync with Google Drive / a folder on this computer" choice. On iPad it goes straight to Drive.
  - Labels and tooltips name the target, e.g. "Google Drive · Estoria".
  - New footer states for "Drive needs reconnecting" and "can't see this project's file".
- **History popover / Backups (`SyncHistoryPopover.tsx`, `SyncFileList.tsx`, `BackupsModal.tsx`, the Toolbar menu item):**
  - These use the active `SyncFolder`.
  - "Change…" lets you switch target, or disconnect Drive (which forgets the folder and token on this device).
  - The Backups menu item shows when a target exists.
- **`useStore.ts`:** saved copies go through the same target (one import change).

## Step 5: Docs
- **SPECS:**
  - §8: Drive as a sync target, the `drive.file` and Picker flow, token handling, and the duplicate-file guard.
  - §6 item 7: mark the "NEXT UP" handoff done.
  - §4: the Persist rows.
  - §7 note "Firefox/Safari have no folder access": they now have Drive.
- A `SESSIONS.md` entry.
- Commit only after you've tested it, then push and deploy only on your go-ahead.

## Out of scope
- Images as separate Drive files (§9 item 13).
- The Android app calling the Drive API (it keeps reading the same file through Android's file picker).
- Loading only the open project.
- Real-time collaboration.

## Files
- **New:** `src/lib/syncFolder.ts`, `src/lib/drive.ts`, `src/lib/driveConfig.ts`, `src/lib/syncTarget.ts`, `public/privacy.html`
- **Changed:** `src/lib/sync.ts`, `src/lib/backup.ts`, `src/components/Footer.tsx`, `SyncHistoryPopover.tsx`, `SyncFileList.tsx`, `modals/BackupsModal.tsx`, `Toolbar.tsx`, `store/useStore.ts` (import only)
- **Unchanged on purpose:** `store/persistence.ts`, `lib/merge.ts`, `SyncConflictModal.tsx`, the file format

## Verification
- **`npm run typecheck` and `npm run build`.**
- **Folder sync didn't regress.** On the dev server with an OPFS folder standing in for the picked one (as earlier sessions did), I'll check: create, push, pull, conflict with keep / merge, history and restore, and backup rotation, all exactly as before.
- **Drive (needs Step 0, and you sign in yourself in the browser pane; I never enter credentials):**
  - connect;
  - first Sync creates the file;
  - the edit mirror updates it;
  - a "phone edit" (changing the Drive file directly through the API from the console) shows "file changed elsewhere", then pulls;
  - both sides changed opens the conflict dialog, and the conflict copy appears in Drive;
  - backups rotate to 5;
  - history and restore;
  - an expired token is forced: the background stays silent and the footer offers Reconnect;
  - the remembered file is trashed: the footer says it can't see the file, with no duplicate created.
- **iPad:** Safari in the iOS Simulator at `localhost:5173` (a real WebKit engine) for the connect flow and layout.
- **Then you:**
  - your Mac and the iOS Simulator locally;
  - your phone's Android app opening the Drive-created file;
  - after deploy, your real iPad. Real devices can only sign in on registered addresses, so a real iPad can be tested only once it's deployed.
  - The deploy itself is low-risk: nothing changes for anyone until they press Connect to Google Drive.
