# v3: Estoria is not only a story map — CLOSED

> Completed 2026-08-02 on `feature/manuscript-mode`. Kept for the reasoning, not
> as work. Nothing here is outstanding.

Adding a place to write changed what the product is, and the copy had not caught
up. This was done as a **v3**, from a `0.1.0` never touched since the first
commit. The build number is the git commit count, so it carried on by itself,
and the `About` modal picks the version up from `package.json` with no work.

**What changed**

- `package.json`: version `0.1.0` → `3.0.0`, description → `Estoria | Map and
  Write Your Story`.
- `index.html`: the `<title>`, which is what the browser tab shows, plus a
  `meta description` the file did not have at all. Both carry the same line.
- `README.md`'s opening line and `SPECS.md` §1.
- The AI import prompt in `src/lib/markdown.ts`.

**The one careful edit.** The import prompt documents a format the parser reads
and the Android app shares, so only the sentence describing the app changed. The
schema, the field separators and the headings it specifies were left alone,
which is what stopped every vault already on disk from desyncing. Same rule
applies to anything similar later: change the prose around the format, never the
format.

**Deliberately not changed.** Two mentions of "Story Mapping" remain and should:
one names the `Story Mapping WebApp Prototype/` folder, a real directory and the
design reference (SPECS §1), and renaming it is its own job. The other names the
published guides the story templates were drawn from, in `src/lib/templates.ts`,
and bending a citation to fit our positioning would be wrong.

**House style, which caught two regressions in this same pass.** No em dashes in
anything the user reads (SPECS §3). The chapter heading in every manuscript
export used one as a separator and shipped it in the `.docx`, `.md` and `.txt`;
the target field used one as its empty placeholder. Both fixed. Code comments
are exempt; exported and on-screen text is not.
