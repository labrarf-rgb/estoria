# Plan: Back up and sync with Google Drive (revision 2)

> **Status (2026-10-11):** revised in Session 65, replacing the plan approved in
> Session 64. Reviewed against the code in Session 66 (see "Review against the
> code" below; its fixes are folded into the phases). **Phase A built in
> Session 66 and shipped as Deploy A (build 198, `6e5af0c`, 2026-10-11).** Next: a few
> days of normal folder use (the gate before Deploy S). Linked from SPECS §6 item 7
> ("NEXT UP").
>
> **What changed from revision 1, and why:**
> - **A small login server (a "token broker") was added.** Without it, Google
>   sign-in in the browser lasts about an hour, and after that background backup
>   paused until the user tapped (a popup flashed). The user ruled that out. With
>   the broker you stay signed in, and backup runs in the background on every
>   device.
> - A review against the code found hazards revision 1 didn't cover: rolling
>   back work when switching targets, same-name duplicate files on Drive,
>   renames, no "check, then write" on Drive, Safari blocking popups, uploads
>   over 5 MB, two tabs syncing at once, the phone reading a stale copy, signing
>   in with the wrong account, and a new iPad having no way to get a project.
>   Each one has a fix below (the "Hazard register" section).
> - The rollout is split into separate deploys, each one tested before the next,
>   and an automated test suite comes before the refactor.
> - A real database backend (Supabase, or Vercel + Neon) was looked at and set
>   aside in Session 65. It would mean rebuilding the Android app's sync and
>   holding users' manuscripts on Estoria's side. Drive + broker keeps both
>   unchanged.
>
> **Where to start in a new session:** the decisions at the bottom are
> answered. Phase A (tests + refactor) needs nothing from Google and can begin.
> Process the user expects: build, verify in the browser pane, then the user
> tests locally. Commit, push and deploy only on their go-ahead, one deploy at a
> time.

---

## The goal, and how it's measured

**Estoria backs up to Google Drive seamlessly and reliably on the laptop, the
iPad and the Android phone.** In practice:

1. **Seamless:** after connecting once per device, saves reach Drive in the
   background with no taps, popups or hourly sign-ins.
2. **Reliable:** no path can silently overwrite work, create a duplicate file,
   or let you believe something is backed up when it isn't. You can always see
   when Drive last got your work.
3. **Every device:** desktop Chrome, Safari (Mac and iPad, in the browser or
   installed to the home screen), Firefox, and the Android app reading the same
   file.
4. **Prod-safe:** nobody who doesn't press Connect sees any change. Folder sync
   in desktop Chrome behaves exactly as today. Drive can be switched off for
   everyone without a redeploy.

## Shape of the solution (unchanged from revision 1)

**Drive becomes a second kind of "Estoria folder" under the existing Sync, not
a new storage layer.** `lib/sync.ts` already does what Drive needs:

- the three-way compare;
- conflict copies and per-item merge;
- rotating backups, history and restore;
- the fast-forward-only auto-mirror;
- the "file changed elsewhere" check.

All of it rests on four folder operations (read, write, list, remove). Put them
behind one interface and Drive inherits all of it. The Android file contract
(`<slug>.estoria.json`, SPECS §8) is untouched.

**Decided with the user (still standing):**
- the `drive.file` scope: Estoria sees only files it created, or files you pick
  for it;
- the app stays on `https://www.labrarf.com/estoria/`;
- local-first stays;
- the Android app keeps reading the same file through Android's file picker.

## The login server ("token broker")

**Why it's needed.** Browser-only Google sign-in hands out access tokens that
last about an hour, and getting a new one takes a popup tied to a click. Staying
signed in needs a **refresh token**, and getting one needs the OAuth **client
secret**, which can't ship in a web page. So a tiny server holds the secret and
does only that.

**What it does, and nothing more.** It never sees a manuscript. The browser
still talks to Drive directly, so your writing goes from the browser to Google
and never through labrarf.com. The broker only trades sign-in tokens.

| Endpoint | Does |
| --- | --- |
| `POST /auth/exchange` | Takes the one-time code from Google's sign-in, exchanges it (using the secret) for an access token + refresh token. **Encrypts the refresh token into a cookie** (`HttpOnly; Secure; SameSite=Strict`). Returns the access token, its expiry and the account email to the page. |
| `POST /auth/token` | Reads the cookie, asks Google for a fresh access token, returns it, and re-sets the cookie so it slides forward. If Google says the grant is revoked: clears the cookie and returns `401` (the app shows "Reconnect"). |
| `GET /auth/start` | *(added when building, Session 66)* Begins the redirect flow: checks `?return=` is an Estoria page, seals a one-time state into a short-lived cookie, sends the browser to Google. The callback refuses any state that doesn't match it (sign-in CSRF). |
| `GET /auth/callback` | Only for the redirect sign-in flow (iPad home-screen app, if Step 1 shows popups fail there). Does the same exchange, sets the cookie, then sends the browser back to the app with nothing in the URL. |
| `POST /auth/disconnect` | Revokes the refresh token at Google and clears the cookie. |
| `GET /status` | `{ drive: "on" \| "off" }`. **The kill switch** (see Prod safety). |

**Design rules:**
- **No database and no stored tokens.** The only copy of a refresh token is in
  that device's cookie, encrypted with a key that exists only in the server's
  environment (`TOKEN_KEY`, AES-GCM). Nothing to breach at rest.
- **Secrets live only in the host's environment settings:** the client secret
  and `TOKEN_KEY`. They're never in the repo and never pasted into a chat.
- **Locked to Estoria's pages.**
  - CORS allows only `https://www.labrarf.com`, `https://labrarf.com` and
    `http://localhost:5173`, with credentials.
  - The allowed origins and the cookie domain are read from the broker's
    environment (`ALLOWED_ORIGINS`, `COOKIE_DOMAIN`), not hard-coded. A future
    domain move is then a settings change (see "A future domain of its own"
    below).
  - The server checks the `Origin` header.
  - Every call needs a custom header, which forces a preflight and stops other
    sites from triggering it (CSRF).
- **Doesn't log tokens or codes.** Request logging stays off for those routes.
- **Same site as the app.** It must be served from **`auth.labrarf.com`** (a
  custom subdomain), not a `*.vercel.app` address. Safari blocks cookies for a
  different site, but `auth.labrarf.com` and `www.labrarf.com` count as the
  same site.
  - **Known Safari limit:** Safari caps cookies from a subdomain hosted
    elsewhere to 7 days. Because every refresh re-sets the cookie, this
    means: **stay signed in as long as you open Estoria on that device at
    least once a week.** After a longer gap, one tap reconnects. (Safari wipes
    a website's data after 7 days without a visit anyway, unless it's
    installed to the home screen; see the Hazard register, Safari 7-day wipe.)
- **If the broker is down,** Drive pauses ("Drive paused · retrying"). Local
  work is unaffected, and nothing loops or pops up.
- **If someone unticks Drive** on Google's consent screen, the broker gives
  the grant straight back and answers `drive_scope_missing`; the app asks
  them to connect again with Drive ticked. *(Added when building.)*
- **Host request logs:** the redirect flow's `/auth/callback?code=…` may show
  up in Vercel's request log. The code is single-use, already spent by the
  time anyone could read it, and useless without the secret.
- **Code lives in this repo** under `auth-server/`, with its own
  `package.json`. It's deployed on its own and never by `npm run deploy`. It's
  about 150 lines.

**Sign-in flow in the app (`src/lib/driveAuth.ts`):**
1. **Connect** (a click) uses Google's sign-in library in *code* mode. A popup
   (or a redirect on an iPad home-screen app) returns a one-time code, and the
   app sends it to `/auth/exchange`.
2. The access token is kept **in memory only**, never in localStorage.
3. **About 5 minutes before expiry,** or after any `401` from Drive, the app
   calls `/auth/token` quietly. No popup, no click needed.
4. **Google's sign-in script loads at startup only on devices whose Sync target
   is Drive.** If a reconnect click had to wait for the script, Safari would
   block the popup. Everyone else never loads it.
5. **Scopes:** `drive.file` plus `openid email`, so the app can show which
   account is connected. Both extra scopes are non-sensitive and need no Google
   review.

## Hazard register: what could go wrong, and the fix

| # | Hazard | Fix in this plan |
| --- | --- | --- |
| H1 | **Switching target rolls work back.** The "last agreed" fingerprint is stored per project, not per target. A device switching from folder to Drive could treat an older Drive copy as "only the file changed" and load it over newer local work. | Key it per target: `estoria:sync:lastHash:<target>:<projectId>`. The first sync on a new target has no baseline, so any difference shows as a **conflict** (safe, never a silent pull). The folder target keeps reading the old key, so desktop Chrome sees no change. |
| H2 | **Same-name duplicates.** Drive allows two files with the same name in one folder. Estoria may not see a file the phone or the Drive desktop app created. A brand-new file can be missing from a listing for a moment. A failed create, retried, can make two. | (a) The main file is **addressed by Drive file ID**, remembered per project per device, not looked up by name. (b) **Never create a project's main file without asking first:** "This project isn't in Estoria's Drive folder yet. Is it already in Drive from another device? [Pick it] [Create it]." (c) A create is never blindly retried; after a failure the app lists by name first. (d) After any create, the app lists by name, and if it finds two, it stops and shows both rather than picking one. |
| H3 | **Rename.** Names come from the title, so a rename makes a new main file and the phone stays on the old one. | On Drive the ID stays the same: a rename **renames the file in place** (a metadata update), so the phone keeps following it. Backup and conflict copies take the new name from then on. Folder sync keeps today's behavior (out of scope, noted in SPECS). |
| H4 | **No atomic "check, then write".** Another device can write between Estoria reading the file and writing it. | Remember the file's `headRevisionId` from the read. Right before writing, fetch only its metadata; if the revision moved, abort and re-run the compare. Step 1 tests whether Drive honors a conditional update; if it does, use that instead. Drive's own revision history (kept about 30 days) is a last-resort net under both. |
| H5 | **Safari blocks popups** that aren't directly from a click, and today's Sync waits in a queue before it runs. | With the broker, popups happen only on Connect/Reconnect. Those clicks call Google's sign-in **before** any `await` or queue. Background refresh is a plain `fetch`. Script preloading: see the sign-in flow above. |
| H6 | **iPad home-screen app.** Google's popup sign-in is known to misbehave in installed iOS web apps. | Detect standalone iOS and use the **redirect** flow (`/auth/callback`) there. Step 1 confirms which flow works. Any pending save is flushed before leaving the page. |
| H7 | **Permanent delete.** Pruning to 5 backups deletes files. | On Drive, pruning moves old backups to **Drive's trash** (recoverable for 30 days). Estoria never permanently deletes a file on Drive. |
| H8 | **A new device can't get your projects.** Sync only works on a project already open on that device. | Add **"Open from Google Drive"** in the Projects modal: it lists the main files in the Drive folder (live files only, not backups) and opens one. That links the project to its file ID, so the first Sync reads "in sync". It's also how you recover an iPad Safari wiped. |
| H9 | **Silent failure.** Background errors are silent by design, so you can't tell whether Drive has your latest work, and on iPad Drive is the only copy that lasts. | A footer line: **"Backed up to Drive · 12 min ago"**, from the last confirmed write or match. It warns when work is unsaved to Drive for more than 30 minutes while edits exist. Separate states for offline ("will retry"), paused (broker or kill switch) and "needs reconnecting". |
| H10 | **Safari 7-day wipe.** Safari clears a website's storage after 7 days without a visit, unless it's added to the home screen. | One-time tip on iPad Safari: "Add Estoria to your Home Screen so Safari keeps your work." H8 recovers everything from Drive if a wipe happens anyway. |
| H11 | **Projects never opened since connecting aren't backed up.** The mirror only covers the open project. | When Drive is first connected, offer **"Back up all N projects now"**, run one at a time through the normal Sync (with H2's ask-before-create). The Projects modal shows each project's Drive state (backed up · not yet · needs review). |
| H12 | **Two tabs at once.** Each tab has its own queue, so two tabs could interleave a compare and a write. | Wrap the existing queue in the browser's **Web Locks API** (`navigator.locks`, one lock named `estoria-sync`), so all of this browser's tabs take turns. Where Web Locks is missing, fall back to today's per-tab queue. |
| H13 | **Big uploads.** Drive's simple multipart upload stops at 5 MB, and a large project file is 15–18 MB (SPECS §8 "How big can a project get?"). Rewriting that every few seconds on cellular is heavy. | Use Drive's **resumable upload** for any file over 4 MB. Throttle the Drive mirror: after edits settle, at most once every 30 seconds while typing, plus straight away when the tab is hidden. **Closing the tab can't be covered:** a request sent while a page unloads is capped at 64 KB, so the last ≤30 s of edits reach Drive on the next open, and H9's "unsaved to Drive" state shows it meanwhile. Folder mode keeps its 2.5 seconds. |
| H14 | **Rate limits, 5xx, offline.** | Back off and retry (1s, 2s, 4s…, max 5 min) on `429` and `5xx`. Offline means "will retry" and is never treated as needing reconnecting. Retries respect H2(c). |
| H15 | **The phone reads a stale copy.** Android's Drive file provider can serve a cached version. If the phone then writes from it, a web edit could be overwritten, and on the web it would look like "only the file changed". | (a) Step 1 measures how stale the phone's reads get. (b) **New safety rule on every target: before loading a newer file over local state, write the local state as a backup first.** Today's pull backs up the incoming copy, which is already in the main file. This changes folder behavior slightly, so it ships in Phase B, not in the identical-behavior refactor. (c) If staleness turns out to be real, the Android side gets a "refresh before sync" fix in its own session (Estoria-aa). |
| H16 | **Wrong Google account.** Connecting the iPad with a different account silently splits your work across two Drives. | Show "Google Drive · you@gmail.com" in the footer and history. Remember which account each project last synced with, and if that changes: "This project was last backed up to a different Google account (x@…). Continue with y@…?" |
| H17 | **Moving the laptop from the folder to Drive.** The existing files in Drive were written by the Drive desktop app, so `drive.file` can't see them. | First connect opens Google's Picker on the Estoria folder, where you select the folder and your existing `*.estoria.json` files (multi-select). Per-target baselines (H1) mean the first sync reads "in sync" when the files match, and a conflict when they don't. Never a silent overwrite. |

## Review against the code (Session 66)

Checked against `lib/sync.ts`, `lib/backup.ts` and `Footer.tsx` before Phase A.
The design holds; these are places where the code forces a decision the plan
hadn't made. Each fix is folded into the phase it belongs to.

| # | Gap | Fix |
| --- | --- | --- |
| R1 | The name-keyed `read / write / list / remove` interface has no room for H4's revision check, H2a's file-ID addressing or H3's rename. | Shape it in Phase A so `sync.ts` changes once: `read(name)` → `{ text, rev? }` or `null` (not found); `write(name, text, opts?: { expectRev? })`; `list()` → `{ name, lastModified }[]` (the history popover shows the date); `remove(name)` (trash on Drive). Name → file ID, rename and ask-before-create live inside `DriveFolder`. |
| R2 | `locked()` in `sync.ts` forgets the folder on any `NotFoundError`. Behind a shared interface, a Drive "file not found" would wipe the remembered folder. | Each folder kind raises its own `SyncFolderGoneError`; `locked()` reacts only to that, and `LocalFolder` decides what "gone" means for a directory handle. |
| R3 | Both the mirror and the Sync button create the main file when it's missing, which H2b forbids on Drive. | Phase B adds a `needs-link` outcome to `syncProject` and the mirror, and the Footer handles it (the "Pick it / Create it" ask). Folder target keeps creating. |
| R4 | The Footer hides all of Sync when the folder picker is unsupported (`pickerSupported`), which is exactly Safari and iPad, where Drive is the target. | Phase B: Sync visibility comes from `syncTarget.ts` (a target is configured or offered), not from the picker check. |
| R5 | H13's "straight away when closed" can't be delivered for multi-MB files (64 KB cap on unload requests). | Wording fixed in H13: best effort on hide; H9 covers the gap. |
| R6 | The tests must pass "unchanged" before and after the refactor, so they need a seam that exists in both. | The suite mocks only `getBackupDir()` (and `forgetBackupDir()`) to return an in-memory directory handle. `LocalFolder` wraps that same handle, so the identical suite runs against old and new code. Tests assert outcomes, never localStorage key names (A.5 renames the keys). |
| R7 | Small: Web Locks changes how tabs interleave (same outcomes, so "identical behavior" means identical results); `checkRemoteChanged` stays unlocked as today; tests need a `localStorage` stand-in; Vercel may ask for a TXT verification record next to the `auth` CNAME. | Noted in the relevant steps. |
| R8 | Found while building Phase A: `resolveConflict` writes the winner without re-reading, so a phone write during the dialog would be overwritten. The folder target has always worked this way. | Phase B: the conflict outcome carries the file's `rev`, and `resolveConflict` passes it as `expectRev` on Drive, so a mid-dialog change aborts and re-runs the compare. |

## Prod safety

**Who is affected by each deploy.** Nothing changes for anyone who doesn't
press Connect. Desktop Chrome folder sync must behave identically, and it's
proven by tests rather than by eye.

**Kill switch.** The app checks `auth.labrarf.com/status` when it starts and
every 30 minutes. If it says `off`, or the broker is unreachable on startup,
Drive does no writes and the footer says "Drive backup paused". Flipping it is
an environment change on the broker, so there's no app deploy, and local work
keeps saving.

**Rollback.** The app's deploy and the broker's deploy are separate. Each can
be rolled back on its own: the app by redeploying the previous commit, the
broker from the host's dashboard. With the Drive settings empty in
`src/lib/driveConfig.ts`, the Drive option disappears entirely.

**The rollout, one deploy at a time, each with your go-ahead:**

| Deploy | Ships | Visible to | Gate before the next |
| --- | --- | --- | --- |
| **A** | Automated tests for today's `sync.ts` (dev-only, never shipped), then the `SyncFolder` refactor with **identical behavior**, plus Web Locks (H12) | Nobody (internal) | Tests pass on the old code **and** the new code. You use folder sync normally for a few days |
| **S** | The broker at `auth.labrarf.com` (no app change) | Nobody | Step 1 checks pass against it |
| **B** | All Drive code, **hidden behind a per-device switch** (`?drive=on`, remembered on that device only) | Only devices you turn it on for | You run it on your real laptop, iPad (Safari and home-screen app) and Android against prod for about a week |
| **C** | Show "Connect Google Drive" to everyone, plus `privacy.html` | Anyone who presses Connect | Proven in B |

## Phases of work

### Step 0: Google + hosting setup (you, with me walking you through it)

This is in addition to revision 1's Step 0. If you've already started, keep what
you made.

1. Google Cloud project `Estoria`, with the **Drive API** and the **Picker API**
   enabled.
2. **Consent screen:**
   - External, app name `Estoria`, no logo;
   - scopes `drive.file`, `openid`, `email`;
   - Audience **In production**. In "Testing", refresh tokens expire after 7
     days.
3. **OAuth client (Web application):**
   - JavaScript origins: `https://www.labrarf.com`, `https://labrarf.com`,
     `http://localhost:5173`;
   - Redirect URIs: `https://auth.labrarf.com/auth/callback` and
     `http://localhost:3000/auth/callback`.
   - **Copy the client secret straight into the host's environment settings
     (step 6). Never into a chat or a file.**
4. **API key** restricted to the Picker API and those three origins.
5. **Project number** (the Picker's app ID).
6. **Broker host** (see Open decisions):
   - create the project, pointing at `auth-server/`;
   - set the environment variables `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
     `TOKEN_KEY` (you generate it with `openssl rand -base64 32`) and
     `DRIVE_STATUS=on`.
7. **DNS, at whois.com** (labrarf.com's nameservers are `ns1–ns4.whois.com`):
   **add one** CNAME record, `auth` → the target Vercel gives you (plus a TXT
   record only if Vercel asks to verify the domain). This is the
   only DNS change in the whole plan, and the one step that could affect the
   portfolio site or email, so:
   - **Before:** screenshot every existing record. As of 2026-10-11 they are:
     - the apex `labrarf.com` A records → GitHub Pages (`185.199.108–111.153`);
     - `www` → `labrarf-rgb.github.io`;
     - MX → `mx1/mx2.improvmx.com` (email).
   - **Add only. Never edit or delete** the apex, `www` or MX records.
   - **After:** Claude checks with `dig` that `auth.labrarf.com` resolves, that
     the apex, `www` and MX records are unchanged, and that
     `https://www.labrarf.com` and `/estoria/` still load. If anything is off,
     restore from the screenshot.
8. You give me the **client ID, API key and project number.** All three are
   public by design and go in `src/lib/driveConfig.ts`.

**Step 0 progress (Session 66, 2026-10-11).** Public values only; the client
secret and `TOKEN_KEY` never go in this repo.

| Item | Status / value |
| --- | --- |
| Google Cloud project | `Estoria`, Drive API + Picker API enabled |
| Consent screen | External, **In production**, no logo; scopes `drive.file`, `openid`, `userinfo.email`; home page `https://www.labrarf.com/estoria/`, privacy `https://www.labrarf.com/estoria/privacy.html` |
| OAuth client (`Estoria web`) | Client ID `177782323056-c0t0uclj35u6l73tf3n0q6pvb06dbfch.apps.googleusercontent.com`; origins and redirect URIs as in item 3. Secret not kept: add a new one on the client page when Vercel is set up |
| API key (`Estoria Picker`) | `AIzaSyCdjbT3Zk9Q8liOFG109NJyhYk7ffslG0k`; restricted to the three website origins and the Google Picker API only |
| Project number | `177782323056` (the Picker's app ID); project ID `estoria-511314` |
| Broker code | **Written (Session 66):** `auth-server/`, 31 tests against a fake Google, checked over real HTTP locally. Not deployed |
| Vercel | Project `estoria-auth-server` (Hobby, root directory `auth-server`), all six settings Production only. Live at `https://estoria-auth-server.vercel.app`: `/status` on, preflight 204, other sites 403, `/auth/start` redirects to Google with the right client. Old client secret disabled in Google (delete once a real sign-in works) |
| DNS (`auth` CNAME) | **Added 2026-10-11** at whois.com: `auth` → `f39fd1f062c3f808.vercel-dns-017.com` (TTL 28800); A, `www`, MX, TXT unchanged and the site still loads. Before/after screenshots kept locally (not in git) in `Portfolio-Website/_private-dns-backup/`. Waiting on propagation + Vercel's certificate |
| **Resume here** | When Vercel shows `auth.labrarf.com` Valid: rerun the `/status`, preflight, 403 and `/auth/start` checks against `https://auth.labrarf.com`. Then Step 1 (real Google sign-in checks), then delete the disabled old client secret |

### Phase A: tests, then the folder interface (no behavior change) → Deploy A

1. Add `vitest` (dev-only) and `src/lib/sync.test.ts`. It runs **against
   today's code** with an in-memory folder, covering:
   - created / in-sync / pushed / pulled / conflict;
   - resolve mine / theirs / merge (both copies kept);
   - mirror fast-forward and "behind";
   - check-changed;
   - list and restore (read-before-prune);
   - rotation to 5;
   - a too-new schema refused;
   - corrupt file never overwritten by the mirror.
   The only seam is `getBackupDir()` / `forgetBackupDir()`, mocked to an
   in-memory directory handle (R6).
2. **New `src/lib/syncFolder.ts`:**
   - `interface SyncFolder { id; label; read(name); write(name, text, opts?); list(); remove(name) }`
     with the shapes in R1, plus `SyncFolderGoneError` (R2)
   - `LocalFolder` wraps today's handle, moving the `getFileHandle` /
     `createWritable` / `values` / `removeEntry` calls out of `sync.ts` and
     `backup.ts`.
3. **`sync.ts` and `backup.ts`** take a `SyncFolder` from one `getSyncFolder()`.
   - The same tests must pass **unchanged**.
   - Not touched: the fingerprint, `diffDocs`, `merge.ts`, the conflict
     dialog, the file format.
4. Wrap the queue in Web Locks (H12).
5. Baselines move to per-target keys (H1). **As built:** the folder target
   keeps its original key (`estoria:sync:lastHash:<projectId>`) and other
   targets get `estoria:sync:lastHash:<target>:<projectId>`. Same protection,
   no migration, and a rollback of Deploy A finds every baseline where it was.
6. Verify: typecheck, build, tests, and the folder flows on the dev server (an
   OPFS folder as stand-in, as in earlier sessions).

### Step 1: day-one checks against real Drive (needs Step 0 + Deploy S)

With a scratch folder and your account (you sign in yourself; I never enter
credentials):

- **Folder access:** after picking only the folder in the Picker, can Estoria
  list and read the files already inside it?
- **File IDs:** do Drive desktop writes on the Mac keep the file ID? Android's
  `"wt"` writes should; confirm.
- **Conditional update:** does Drive reject a write when the revision moved
  (H4)?
- **Refresh token:** does code-mode sign-in reliably return one, and does
  `/auth/token` work after an hour?
- **Safari:** cookie and refresh on Mac Safari locally. iPad Safari and the
  home-screen app **only after Deploy B**, because real devices can only sign
  in on registered addresses.
- **Phone staleness (H15):** after a web write, how long until the Android app
  reads the new content?

The plan is written for the worst case of each, so results only simplify it.

### Phase B: the Drive client and UI → Deploy B (hidden)

- **`src/lib/drive.ts`:** Drive v3 over `fetch`:
  - list (by folder, name, not trashed);
  - read (`alt=media`, with its `headRevisionId`);
  - create (resumable over 4 MB);
  - update (revision check per H4);
  - rename;
  - trash.
  - Backoff per H14.
- **`src/lib/driveAuth.ts`:** the broker calls, the in-memory token, early
  refresh, the popup or redirect choice, the account email.
- **`DriveFolder implements SyncFolder`:**
  - file ID by project (H2a, H3);
  - ask-before-create (H2b);
  - duplicate check (H2d);
  - trash on prune (H7).
- **`src/lib/syncTarget.ts`:** the active target per device (`folder` / `drive`
  / none).
  - Safari, Firefox and iPad: Drive only. Desktop Chrome: you choose.
  - The `?drive=on` switch for Deploy B. The status kill switch.
- **Pull-safety rule** (H15b) on both targets, with a test added.
- **`needs-link` outcome** from `syncProject` and the mirror on Drive (R3).
- **UI:**
  - **Footer:** Sync visibility from the active target, not the picker check
    (R4); target and account name, "Backed up to Drive · N min ago",
    and the paused / offline / reconnect / can't-see-file states (H9, H16).
  - First-sync chooser: "Google Drive / a folder on this computer".
  - **Projects modal:** "Open from Google Drive" (H8), "Back up all" (H11),
    and each project's Drive state.
  - **History popover, Backups and Toolbar:** use the active target;
    "Change…" switches target or disconnects.
  - The iPad home-screen tip (H10).
- **`useStore.ts`:** saved copies go through the active target (one import
  change).

### Phase C: public → Deploy C

- `public/privacy.html` **(shipped early, Session 66):** Google now requires a
  home page and privacy policy link before the consent screen can be put "In
  production", so the page went live ahead of Phase C. Review its wording
  against the finished Drive feature here. It covers:
  - Estoria stores projects in your browser and, if you connect it, in your own
    Google Drive;
  - a sign-in helper at auth.labrarf.com keeps you signed in and never sees
    your writing;
  - nothing else is collected.
- Link it and the home page on the consent screen.
- Remove the `?drive=on` gate.
- **Docs:**
  - SPECS §8: Drive as a target, the broker, the hazard rules;
  - SPECS §4: the Persist rows;
  - SPECS §6 item 7: done;
  - the SPECS §7 note on Firefox/Safari;
  - a SESSIONS entry.

## Out of scope

- Images as separate Drive files (§9 item 13).
- The Android app calling the Drive API. It keeps the file picker. A
  staleness fix, if Step 1 shows one is needed, is its own session in
  Estoria-aa.
- Fixing folder-mode renames.
- Loading only the open project.
- Real-time collaboration.

## A future domain of its own (considered 2026-10-11, deferred)

The user asked whether Estoria should get its own domain (e.g. `estoria.app`).
**Not now.** Browsers keep a website's data under its exact address, so moving
the app strands everything saved locally: projects, settings, the folder handle,
the iPad home-screen install. iPad projects are the most exposed, because Safari
has no sync today. Moving before Drive works would mean exporting and
importing every project by hand on every device.

**After Drive works, a move is cheap.** `drive.file` access is tied to the
Google Cloud project, not the web address. The steps would be:

1. Add the new origin to the OAuth client and the broker's `ALLOWED_ORIGINS`.
2. Open Estoria at the new address.
3. On each device, use "Open from Google Drive" (H8).

Android doesn't care either way. Hosting the app and broker together on one
domain would also remove the Safari 7-day cookie cap. So: build on
`labrarf.com`, and move only once every device's projects are confirmed in
Drive.

## Files

- **New:**
  - `auth-server/` (exchange, token, callback, disconnect, status, crypto,
    config)
  - `src/lib/syncFolder.ts`
  - `src/lib/drive.ts`
  - `src/lib/driveAuth.ts`
  - `src/lib/driveConfig.ts`
  - `src/lib/syncTarget.ts`
  - `src/lib/sync.test.ts`
  - `public/privacy.html`
- **Changed:**
  - `src/lib/sync.ts`
  - `src/lib/backup.ts`
  - `src/components/Footer.tsx`
  - `SyncHistoryPopover.tsx`
  - `SyncFileList.tsx`
  - `modals/BackupsModal.tsx`
  - `modals/ProjectsModal.tsx`
  - `Toolbar.tsx`
  - `store/useStore.ts` (import only)
  - `package.json` (vitest, dev-only)
- **Unchanged on purpose:**
  - `store/persistence.ts`
  - `lib/merge.ts`
  - `SyncConflictModal.tsx`
  - the file format and the Android contract
  - `public/sw.js` (it already ignores other sites' requests, so Google's
    APIs are never cached)

## Verification

- **Every phase:** `npm run typecheck`, `npm run build`, and the test suite.
- **Phase A:** the suite passes before and after the refactor, plus the folder
  flows by hand on the dev server.
- **Phase B, on localhost with the broker running locally** (you sign in):
  - connect;
  - the first Sync asks before creating;
  - the mirror updates the file;
  - an edit made directly in Drive shows "file changed elsewhere", then
    pulls (with the pre-pull backup);
  - both sides changed opens the conflict dialog, and the conflict copy
    appears in Drive;
  - backups rotate to 5 and old ones go to Drive's trash;
  - history and restore;
  - a rename keeps the file ID;
  - a forced token expiry refreshes silently;
  - revoking access shows Reconnect;
  - kill switch `off` pauses writes;
  - a second tab is serialized;
  - a 20 MB project uploads;
  - a trashed main file shows "can't see this file", with no duplicate
    created;
  - a different account shows the warning.
- **iPad:** layout and the connect flow in Safari in the iOS Simulator at
  `localhost:5173`.
- **Then you, on Deploy B against prod:**
  - your laptop;
  - your real iPad, in Safari and as a home-screen app;
  - your phone's Android app opening the Drive file;
  - a week of normal use before Deploy C.

## Decisions (answered by the user, 2026-10-11)

1. **Laptop: Drive mode everywhere.** Once Drive is connected, every web device
   uses the Drive API, so all of them see the same files and the Drive desktop
   app can't create "(1)" duplicates. Folder sync stays available for folders
   outside Drive.
2. **Rollout: four separate deploys (A, S, B, C)**, including the dev-only test
   package.
3. **Broker host: Vercel Hobby.** Free for personal, non-commercial use. If
   Estoria ever earns money, it moves to Vercel Pro ($20/month) or Cloudflare
   Workers (same code).
4. **DNS: whois.com.** `labrarf.com`'s nameservers are `ns1–ns4.whois.com`
   (checked 2026-10-11), so the `auth` CNAME goes in whois.com's DNS panel.
   `www` currently points at GitHub Pages (`labrarf-rgb.github.io`), and that
   record must not be touched.
