# Handoff: Google Drive sync (end of Session 66, 2026-10-11)

**Read this first in the next session.** It says exactly where things stand,
what's wrong, and what to do next, in order. The full design is
[`PLAN-drive-sync.md`](PLAN-drive-sync.md) (its "Step 0 progress" table has
every value and status). The history is the Session 66 entry in
[`SESSIONS.md`](SESSIONS.md).

**Working agreements (from the user):**
- One step at a time when guiding manual work (Google Cloud, Vercel, DNS).
  Give only the next step and wait for "done".
- Test locally first, then deploy. Nothing goes to prod without the user's go-ahead.
- Claude's `git push origin main` and `npm run deploy` are blocked by the
  permission check: hand those commands to the user. (Pushing the feature
  branch alone has worked.)
- Never ask for a secret in chat. Secrets go clipboard → file or straight into
  Vercel.
- Copy rule: no em dashes in anything user-facing.

---

## 1. Where everything is

| Thing | State |
| --- | --- |
| Branch | Work is on **`feature/drive-sync`** (checked out). `main` is at `07b884b` (pushed): Phase A, the privacy page and docs. It has no Phase B code, and its SPECS/plan predate Phase B, so read the copies on this branch. |
| Unpushed | 4 commits on `feature/drive-sync` (B1 `0a77d47`, B2 `71c017f`, B3a `c24c693`, B3b `ea6f91f`) and this handoff. User runs `git push origin feature/drive-sync`. |
| Local dev config | `.claude/launch.json` has an `estoria-auth-local` entry (runs `node auth-server/dev.mjs` on port 3000), committed with this handoff. |
| Prod app | `www.labrarf.com/estoria`, build 200 (`49bcae9`): Phase A (Sync tests, SyncFolder, Web Lock, per-target baselines) + `privacy.html`. **No Drive code in prod.** |
| Broker | Live at `https://auth.labrarf.com` (Vercel project `estoria-auth-server`, root `auth-server`, Hobby). `/status` = on. Six env vars, Production only. Auto-redeploys when `main` is pushed with `auth-server/` changes. |
| DNS | `auth` CNAME → `f39fd1f062c3f808.vercel-dns-017.com` at whois.com. Before/after screenshots kept locally (not in git) in `Portfolio-Website/_private-dns-backup/`. |
| Google Cloud | Project `Estoria` (`estoria-511314`, number `177782323056`); consent screen External + In production, no logo; client `Estoria web` (one secret, in Vercel); Picker key `Estoria Picker`. Values in the plan's Step 0 table. |
| Real sign-in | Proven once end to end with raydaxn@gmail.com through the broker's redirect flow (Step 1, part). Not yet from inside the app. |
| Local test settings | `auth-server/.env.local` (gitignored, mode 600) has `GOOGLE_CLIENT_ID`, `BROKER_URL=http://localhost:3000`, `ALLOWED_ORIGINS=http://localhost:5173`, `DRIVE_STATUS=on`, a generated `TOKEN_KEY`. **`GOOGLE_CLIENT_SECRET` is not in it yet** (see section 4). |
| Tests | 130 app tests (`npm test`), 31 broker tests (`cd auth-server && npm test`). Typecheck and build clean. |

## 2. What Phase B contains (built, not yet tried with real Google from the app)

Everything is behind the per-device switch `?drive=on`. Without it the app
behaves as prod does today (checked in the browser: no calls to Google or the
broker).

- **B1 engine:** `driveConfig`, `driveErrors`, `driveAuth` (broker client,
  in-memory token, early refresh, stops re-asking once signed out), `drive`
  (REST v3: backoff, resumable over 4 MB, no blind create retry), `driveFolder`
  (`DriveFolder`: live file by linked ID, "unlinked", rename in place, revision
  check, trash, duplicate stop, kill switch), `syncTarget` (switch, per-device
  target, kill switch). `SyncFolder` gained `readLive`/`writeLive`.
- **B2 rules:** pre-pull "before-pull" backup on **both** targets (the one
  folder-sync behavior change); conflict resolve re-checks the revision (R8);
  account-changed per project (H16); `syncBaseline.ts` (forget the agreement on
  re-link); `connectDriveFolder`, `adoptPickedFolder`.
- **B3a UI:** `driveSession` (connect = **full-page redirect on every device**,
  a deliberate change from the plan's popup, reasons recorded in the plan),
  `DriveChooserModal`, `DriveLinkModal`, Footer Drive status line (H9), 30 s
  mirror throttle + flush on hide (H13), history/Backups on Drive.
- **B3b:** Projects window (per-project state, Open from Google Drive, Back up
  all), `drivePicker` (Google Picker, loaded on click), iPad Home Screen tip.

## 3. Review findings (Session 66 self-review). Fix these before Deploy B

Ordered by importance. Each needs a test where it can have one.

1. **Connect would create a second "Estoria" folder (data-split risk, must fix).**
   The user's laptop and Android use an Estoria folder made by the **Drive
   desktop app**. With `drive.file`, Estoria can't see it, so
   `connectDriveFolder` (`src/lib/driveFolder.ts`) creates a new folder called
   Estoria on first connect. The phone keeps reading the old one, so work
   splits. **Fix:** after connecting, before creating anything, ask: "Do you
   already have an Estoria folder in Google Drive (from the Drive app or your
   phone)? [Choose it] [Make a new one]". "Choose it" = Picker for the folder
   (`adoptPickedFolder`), then Picker for its project files (multi-select).
   Only "Make a new one" calls `createFolder`. Flow lives in
   `driveSession.finishConnect` + a small dialog (or a step in
   `DriveChooserModal`).

2. **Bandwidth: whole-file downloads on every mirror and check (must fix).**
   `pushCanonicalIfSafe` downloads the full live file before every write
   (every 30 s while typing), and `checkRemoteChanged` downloads it on every
   focus and every 5 minutes. `backUpAll` does too. A large project is
   15-18 MB, so that's tens of MB a minute, often on cellular (H13's concern).
   **Fix:** remember, per project, the Drive `headRevisionId` and the
   fingerprint of the content last read or written. If `get()` metadata shows
   the same revision, reuse the remembered fingerprint and skip the download.
   Only download when the revision moved. Keep it inside `DriveFolder` (a
   small cache keyed by project) or as an optional `readLiveIfChanged`.
   Test with the fake Drive by counting `download:` calls.

3. **`isLiveFileName` hides projects with "backup", "conflict" or "saved" in the
   title.** `/-(backup|conflict|saved)-/` matches `my-backup-plan.estoria.json`,
   so "Open from Google Drive" and the link dialog won't list it. **Fix:** match
   the real patterns: `-(backup|conflict)-\d{8}-\d{6}` and
   `-saved-[a-z]+-\d{8}-\d{6}` (see `fileStamp` in `lib/backup.ts` and
   `writeSavedCopyFile` in `lib/sync.ts`). Add a test with such a title.

4. **The link can drift to the wrong project ID.** The link is keyed by project
   ID. If a project is linked to a Drive file holding a *different* project ID
   and the person keeps the file's version (pull, or conflict "theirs"),
   `replaceDoc` makes the file's ID the active one, but the link stays under the
   old ID, so the next Sync asks "Which file is this project?" again. **Fix:**
   after a pull or "theirs" on Drive, if `remote.id !== local.id`, move the link
   (and baseline) to `remote.id`. Test in `driveSync.test.ts`.

5. **No automated tests for the new UI** (`DriveChooserModal`, `DriveLinkModal`,
   Footer Drive line, Projects Drive section). Only checked by hand, signed-out
   states only. At least do the manual checklist in section 5 with a real
   sign-in; consider React Testing Library for the Footer status line logic
   (or extract that logic into a pure function and unit test it).

6. **Privacy page doesn't mention Google's sign-in page or file picker.**
   `public/privacy.html` "Services the website relies on" should add: signing
   in happens on Google's own page, and choosing files opens Google's Picker
   (loaded from Google only when used). Phase C docs, but cheap to do now.

7. **Phase C docs not done yet** (planned): SPECS §8 (Drive as a target, the
   broker, the hazard rules), §4 Persist rows, §6 item 7 status, §7 note on
   Firefox/Safari, README (auth-server, `?drive=on`). SPECS on `main` doesn't
   describe Phase B at all yet.

## 4. Next steps, in order (B4: real testing, locally)

The user chose **local testing first**, and to **reuse the `Estoria web`
client** rather than make a separate localhost-only one. Its existing secret
was shown once by Google and was not kept, so it exists only in Vercel.

**Step 4.1: get the secret into `auth-server/.env.local` (user does this).**
- Option A (reuse the existing secret): Vercel → `estoria-auth-server` →
  Settings → Environment Variables → `GOOGLE_CLIENT_SECRET` → reveal/copy. If
  Vercel marks it Sensitive it can't be read back; use option B.
- Option B (a second secret on the same client): Google Cloud → Google Auth
  Platform → Clients → Estoria web → Client secrets → + Add secret → copy.
  Delete that second secret after testing.
- Then the user runs (writes from the clipboard, prints nothing):
  ```bash
  printf 'GOOGLE_CLIENT_SECRET=%s\n' "$(pbpaste)" >> /Users/rfcl/WebAppProjects/Estoria-wa/auth-server/.env.local
  ```
- Claude checks the file has all six keys without printing values:
  `cut -d= -f1 auth-server/.env.local`.

**Step 4.2: fix findings 1-4 above** (with tests), before testing with the real
Drive, so the real test exercises the fixed flows. Finding 1 especially: the
user's real Drive has the desktop-app Estoria folder.

**Step 4.3: start both servers.** `preview_start` `estoria-auth-local` (broker on
3000) and `estoria-dev` (app on 5173), or the user runs `npm run dev` in each.
Check `curl http://localhost:3000/status` → `{"drive":"on"}`.

**Step 4.4: real test on localhost, one step at a time with the user.** Open
`http://localhost:5173/?drive=on`. Use a **scratch project**, not the novel.
Run the checklist in section 5.

**Step 4.5: remaining Step 1 checks** (plan "Step 1"): does picking only the
folder in the Picker let Estoria list/read files already inside it; do Drive
desktop writes keep the file ID; Safari (Mac) cookie + refresh; phone
staleness (how long until the Android app sees a web write). Record results in
the plan.

**Step 4.6: tidy.** Remove the secret line from `.env.local` (or the file) if
the user wants; delete the second Google secret if option B was used. Update
the plan's Step 0 table and SESSIONS.

**Step 4.7: Deploy B (user's go-ahead).** Merge `feature/drive-sync` into
`main` (no-ff, as before), user runs `git push origin main feature/drive-sync`
and `npm run deploy`. Drive stays hidden without `?drive=on`. Note: the
before-pull backup reaches every folder-sync user (it's meant to). Then a week
of real use on the laptop, iPad (Safari and Home Screen app) and the Android
app, per the plan, before Deploy C (remove the switch, Phase C docs).

## 5. Manual test checklist for B4 (from the plan's Phase B verification)

Scratch project, `?drive=on`, local broker:
- [ ] Sync with no target → "Back up with" chooser opens.
- [ ] Connect → Google's page → back to the app with "Connected to Google Drive as …".
- [ ] (After finding 1 is fixed) asked about an existing Estoria folder; choosing it via the Picker works.
- [ ] Sync on a new project → "Which file is this project?" → Create it → in sync, file appears in Drive.
- [ ] Edit → within ~30 s the footer says "backed up to Drive just now"; the file in Drive updates.
- [ ] Edit the file in Drive (or on the phone) → focus the tab → "changed elsewhere, press Sync" → Sync pulls; a `-before-pull` backup appears.
- [ ] Both sides changed → conflict dialog → keep mine → conflict copy appears in Drive.
- [ ] Rename the project → Sync → same Drive file renamed (same ID).
- [ ] Backups rotate to 5; older ones are in Drive's trash.
- [ ] History popover and File → Backups list Drive files; restore works.
- [ ] Projects → Back up all; Open from Google Drive on a project not in this browser.
- [ ] Revoke Estoria at myaccount.google.com/permissions → footer "needs reconnecting" + Reconnect works.
- [ ] Broker `DRIVE_STATUS=off` (restart local broker) → "Drive backup paused", no writes.
- [ ] Second tab open → no interleaving problems.
- [ ] A large project (over 4 MB) uploads.
- [ ] Disconnect from the chooser → back to folder/none; files stay in Drive.

## 6. Smaller notes

- The browser pane used for checks has a real `auth.labrarf.com` cookie from
  Step 1's sign-in test (raydaxn@gmail.com). Harmless; it lives only in that
  pane.
- `auth-server` `POST /auth/exchange` is unused since connect became a redirect;
  kept for a possible popup flow later.
- `DriveLinkModal` "Not listed? Choose it in Google Drive…" and the chooser's
  "Already have an Estoria folder…" use the Picker; neither has been tried with
  a real sign-in.
- A Drive-mode Sync on a project whose file was trashed shows "can't see this
  project's Drive file". There's no in-app way yet to unlink and relink it
  other than the link dialog appearing after an account change. Consider an
  "Unlink" action in the history popover.
