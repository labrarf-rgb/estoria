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
| Pushed | `feature/drive-sync` is on origin (B1-B3b and this handoff). Session 67's fixes are committed on top, not yet pushed. |
| Local dev config | `.claude/launch.json` has an `estoria-auth-local` entry (runs `node auth-server/dev.mjs` on port 3000), committed with this handoff. |
| Prod app | **Deploy B live 2026-10-11:** v4.0.0, build 217 (`a901e78`), `main` merged from `feature/drive-sync` (`0cfe0e8`). Drive hidden without `?drive=on` (checked on prod: no Drive or broker calls). Rollback: `git switch --detach 07b884b && FORCE=1 npm run deploy` (build 200), or broker `DRIVE_STATUS=off` + Vercel redeploy to stop Drive writes only. |
| Broker | Live at `https://auth.labrarf.com` (Vercel project `estoria-auth-server`, root `auth-server`, Hobby). `/status` = on. Six env vars, Production only. Auto-redeploys when `main` is pushed with `auth-server/` changes. |
| DNS | `auth` CNAME → `f39fd1f062c3f808.vercel-dns-017.com` at whois.com. Before/after screenshots kept locally (not in git) in `Portfolio-Website/_private-dns-backup/`. |
| Google Cloud | Project `Estoria` (`estoria-511314`, number `177782323056`); consent screen External + In production, no logo; client `Estoria web` (one secret, in Vercel); Picker key `Estoria Picker`. Values in the plan's Step 0 table. |
| Real sign-in | Proven once end to end with raydaxn@gmail.com through the broker's redirect flow (Step 1, part). Not yet from inside the app. |
| Local test settings | `auth-server/.env.local` (gitignored, mode 600) has `GOOGLE_CLIENT_ID`, `BROKER_URL=http://localhost:3000`, `ALLOWED_ORIGINS=http://localhost:5173`, `DRIVE_STATUS=on`, a generated `TOKEN_KEY`. **`GOOGLE_CLIENT_SECRET` is not in it yet** (see section 4). |
| Tests | 138 app tests (`npm test`), 31 broker tests (`cd auth-server && npm test`). Typecheck and build clean. |

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

## 3. Review findings (Session 66 self-review, Session 67 review)

**Session 67 (2026-10-11): findings 1-4 fixed, plus two more found in review
(A, B).** Each has a test that fails without its fix.
- **1 fixed:** connecting no longer creates a folder when Estoria sees none
  (`connectDriveFolder` returns `none` unless `create`). The chooser asks "Is
  there an Estoria folder in your Drive already?" → Picker (folder, then its
  files) or "No, make a new one". Choosing a different folder drops this
  device's links to files in the old one (`adoptPickedFolder` → `forgetAllLinks`).
- **2 fixed:** `DriveFolder` remembers the live file's content per file ID and
  revision (newest two, in memory), so an unchanged file is never downloaded
  again; writes and creates remember what they wrote.
- **3 fixed:** `parseCopyName` in `lib/backup.ts` matches the stamped patterns
  only; used by `isLiveFileName`, backup rotation and history.
- **A fixed (was live in prod for folder sync):** backup rotation matched
  `<slug>-backup-` as a prefix, so a project titled e.g. "My Story Backup 1"
  (`my-story-backup-1.estoria.json`) counted as My Story's oldest backup and
  was **deleted** once My Story had 5. Same fix as 3.
- **4 fixed:** `SyncFolder.moveProject` (Drive only) moves the link when a pull
  or "theirs" changes the active project ID.
- **B fixed:** "Open from Google Drive" records the file as agreed, so the
  store's tidy-up on open fast-forwards instead of reading as a conflict.
- Also done in Session 67: 6 (privacy page names Google's sign-in page and
  Picker); an offline start re-checks the kill switch on `online`; keeping
  "theirs" names the Drive file after the kept title (no rename back and forth).
  File → Google Drive opens the chooser; New project asks about Drive backup
  (a yes creates the file from the mirror once the name is free).
- Still open: 5 (UI tests), 7 (Phase C docs).

The original Session 66 list, for reference:

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

## 4. Next steps (changed in Session 67: test on prod, not locally)

**Decided 2026-10-11:** the client secret can't be read back from Vercel (all
six variables are Sensitive), and the user chose not to make a second secret.
So B4 runs **on prod after Deploy B**, against the live broker, with Drive
still hidden behind `?drive=on`. Local testing (the old 4.1-4.4 below) is
dropped. Next:
1. User pushes the branch, merges to `main` (no-ff) and runs `npm run deploy`
   (Claude hands over the commands).
2. On `https://www.labrarf.com/estoria/?drive=on`, with a **scratch project**,
   run the section 5 checklist one step at a time with the user. The "existing
   Estoria folder" question should appear on first connect: choose the Drive
   desktop app's folder.
3. The Step 1 checks (4.5 below) and a week of real use, then Deploy C.

**Android is out of scope for now (user, 2026-10-11).** Checklist steps that
need the phone (an edit made on the phone, phone staleness, the phone reading
an iPad-made project) are deferred. What the phone needs is written up in the
Android repo: `/Users/rfcl/AndroidStudioProjects/Estoria-aa/docs/SPECS.md` §7,
"Google Drive sync on the web — TO DO on Android" (includes the same backup
prune bug the web fixed). For "changed elsewhere" tests on the web, make the
outside change from another browser on Drive instead (e.g. Safari vs the iPad).

**Prod checklist so far (2026-10-11, Safari, scratch projects):** connect ✓;
existing-folder question + Picker ✓ (after the key's website restriction was
removed, see SESSIONS 67); new project's file created in the real Estoria
folder ✓ (one folder); rename keeps the same file ID ✓
(`drive-test.estoria.json`, id `1uIV8H7C0hTpEaw6-wqw6k0U2mqGYXueS`).

The old local plan, kept for reference:

The user chose **local testing first**, and to **reuse the `Estoria web`
client** rather than make a separate localhost-only one. Its existing secret
was shown once by Google and was not kept, so it exists only in Vercel.

**Step 4.1: get the secret into `auth-server/.env.local` (user does this).**
- ~~Option A (reuse the existing secret from Vercel)~~ **Not possible
  (checked 2026-10-11):** all six Vercel variables are locked (Sensitive);
  "Copy to Clipboard" is disabled. Don't send the user looking for it again.
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
