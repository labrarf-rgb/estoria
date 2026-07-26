import type { Asset, Character, StoryDoc, WorldEntry } from "@/types";
import { removeAssetLinks } from "@/lib/refs";
import { deleteCharacterDoc, deleteWorldEntryDoc } from "@/lib/entities";

/**
 * Discard blank records the user started but never filled in.
 *
 * "+ Add character" / "+ Add world entry" / "+ Note" create the record up front
 * so there's something to type into. If the user then walks away without typing
 * anything, that placeholder is pure noise — it would otherwise be auto-saved,
 * exported and synced forever. `pruneEmptyEntries` is run when the surface that
 * was editing them closes (panels + chapter detail, see `useStore`).
 *
 * The one rule: only *content* counts. A character's `color` and a world entry's
 * `cat` are defaults the app picked, not something the user wrote, so they don't
 * make a record non-empty. Being pinned or cast in a chapter doesn't either — an
 * empty record says nothing about the chapter it's attached to, and a user who
 * wants a placeholder types one ("Unnamed soldier"). So a blank record is removed
 * wherever it appears: assets via `removeAssetLinks`, characters and world
 * entries via the same `deleteCharacterDoc`/`deleteWorldEntryDoc` the explicit
 * Delete buttons use — all of which sweep every board location, so nothing is
 * left holding a dangling id (the bug SPECS §9 item 5 records).
 *
 * Returns the SAME doc object when there is nothing to prune, so a close that
 * changes nothing doesn't dirty the doc (no autosave, no sync fingerprint churn).
 */
export function pruneEmptyEntries(doc: StoryDoc): StoryDoc {
  let next = doc;

  // Blank assets first — unpinning one can leave a world entry ref-less, which
  // is what makes that entry itself blank for the pass below.
  const emptyAssets = next.assets.filter(isAssetEmpty);
  if (emptyAssets.length > 0) {
    for (const a of emptyAssets) next = removeAssetLinks(next, a.id);
    next = { ...next, assets: next.assets.filter((a) => !isAssetEmpty(a)) };
  }

  for (const c of next.characters.filter(isCharacterEmpty)) next = deleteCharacterDoc(next, c.id);
  for (const w of next.world.filter(isWorldEntryEmpty)) next = deleteWorldEntryDoc(next, w.id);

  return next;
}

/**
 * A note/image/to-do the user never titled, wrote in, uploaded to, or listed a
 * task in. A to-do's blank lines don't count as content for the same reason a
 * character's app-assigned colour doesn't: only what the user actually typed
 * makes a record worth keeping.
 */
export function isAssetEmpty(a: Asset): boolean {
  return (
    !a.label.trim() &&
    !(a.body ?? "").trim() &&
    !(a.src ?? "").trim() &&
    !(a.items ?? []).some((i) => i.text.trim())
  );
}

/** Every text field blank — `color` is app-assigned, so it doesn't count. */
export function isCharacterEmpty(c: Character): boolean {
  return (
    !c.name.trim() &&
    !c.role.trim() &&
    !c.type.trim() &&
    !c.initials.trim() &&
    !c.desc.trim() &&
    !c.bio.trim() &&
    !c.motivations.trim() &&
    !c.want.trim() &&
    !c.need.trim() &&
    !c.notes.trim() &&
    c.traits.length === 0 &&
    c.goals.length === 0
  );
}

/** Every text field blank and nothing pinned — `cat` is a default, so it doesn't count. */
export function isWorldEntryEmpty(w: WorldEntry): boolean {
  return !w.name.trim() && !w.desc.trim() && !w.notes.trim() && w.refs.length === 0;
}
