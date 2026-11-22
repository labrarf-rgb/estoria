import type { ChartPos, Relationship, RelationshipKind, StoryDoc } from "@/types";

/**
 * Character relationships: who is tied to whom, how each sees the other, and
 * where everyone sits on the chart. See docs/SPECS.md §4 ("Relationships").
 *
 * Three optional top-level fields on `StoryDoc`, all series-wide like
 * characters, none needing a schema bump:
 *
 *  - `relationships`: one record per **unordered** pair.
 *  - `relationshipKinds`: the project's own kinds. Absent means the starter set,
 *    so a project that never edited kinds stores nothing, and two devices that
 *    never edited them agree (the starter ids are fixed).
 *  - `relationshipLayout`: where characters were dragged on the chart, as
 *    fractions of its size. Only moved characters have an entry.
 */

/** How many chart swatches there are (`--sw-1` ... `--sw-10` in index.css). */
export const SWATCHES = 10;

/** What every project starts with. Fixed ids, so copies made apart still agree. */
export const STARTER_KINDS: RelationshipKind[] = [
  { id: "family", name: "Family", color: 1 },
  { id: "friend", name: "Friend", color: 2 },
  { id: "romance", name: "Romance", color: 3 },
  { id: "mentor", name: "Mentor", color: 4 },
  { id: "rival", name: "Rival", color: 5 },
  { id: "other", name: "Other", color: 6 },
];

/** The project's kinds: the stored list, or the starters when it has none. */
export function kindsOf(doc: Pick<StoryDoc, "relationshipKinds">): RelationshipKind[] {
  return doc.relationshipKinds ?? STARTER_KINDS;
}

export function kindOf(doc: Pick<StoryDoc, "relationshipKinds">, id: string | undefined) {
  return id ? kindsOf(doc).find((k) => k.id === id) : undefined;
}

/** What a kind is called on screen. */
export function kindName(doc: Pick<StoryDoc, "relationshipKinds">, id: string | undefined): string {
  const k = kindOf(doc, id);
  return k ? k.name.trim() || "Unnamed kind" : "No kind";
}

/** The CSS color for a kind; no kind draws in the faint ink. */
export function kindColor(doc: Pick<StoryDoc, "relationshipKinds">, id: string | undefined): string {
  const k = kindOf(doc, id);
  return k ? `var(--sw-${k.color})` : "var(--faint)";
}

/** Same pair whichever way round. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const otherEnd = (r: Relationship, id: string) => (r.a === id ? r.b : r.a);

/** How `id` sees the other one. */
export const viewOf = (r: Relationship, id: string) => (r.a === id ? r.aView : r.bView);

/** Every relationship one character is in. */
export function tiesOf(doc: Pick<StoryDoc, "relationships">, id: string): Relationship[] {
  return (doc.relationships ?? []).filter((r) => r.a === id || r.b === id);
}

export function sameKinds(x: RelationshipKind[], y: RelationshipKind[]): boolean {
  return (
    x.length === y.length &&
    x.every((k, i) => k.id === y[i].id && k.name === y[i].name && k.color === y[i].color)
  );
}

/** The document with one character's relationships and chart position gone. */
export function withoutCharacter<T extends Pick<StoryDoc, "relationships" | "relationshipLayout">>(
  doc: T,
  id: string
): T {
  const next = { ...doc };
  if (doc.relationships) {
    const kept = doc.relationships.filter((r) => r.a !== id && r.b !== id);
    if (kept.length) next.relationships = kept;
    else delete next.relationships;
  }
  if (doc.relationshipLayout && id in doc.relationshipLayout) {
    const { [id]: _gone, ...rest } = doc.relationshipLayout;
    if (Object.keys(rest).length) next.relationshipLayout = rest;
    else delete next.relationshipLayout;
  }
  return next;
}

type RelFields = Pick<StoryDoc, "relationships" | "relationshipKinds" | "relationshipLayout">;

/**
 * The relationship fields of two projects joined (merging a book into a series,
 * bringing a piece into an anthology). The target wins wherever both have
 * something: a relationship id or pair, a kind id, a character's position.
 * Kinds stay absent (the starters) only when neither project has its own list.
 */
export function unionRelationshipFields(target: RelFields, source: RelFields): RelFields {
  const out: RelFields = {};
  const pairs = new Set<string>();
  const ids = new Set<string>();
  const rels: Relationship[] = [];
  for (const r of [...(target.relationships ?? []), ...(source.relationships ?? [])]) {
    const key = pairKey(r.a, r.b);
    if (ids.has(r.id) || pairs.has(key)) continue;
    ids.add(r.id);
    pairs.add(key);
    rels.push(r);
  }
  if (rels.length) out.relationships = rels;
  if (target.relationshipKinds || source.relationshipKinds) {
    const base = kindsOf(target);
    out.relationshipKinds = [...base, ...kindsOf(source).filter((k) => !base.some((b) => b.id === k.id))];
  }
  const layout = { ...source.relationshipLayout, ...target.relationshipLayout };
  if (Object.keys(layout).length) out.relationshipLayout = layout;
  return out;
}

/** The relationship fields limited to some characters (a piece taken out of an anthology). */
export function relationshipFieldsAmong(doc: RelFields, charIds: Set<string>): RelFields {
  const out: RelFields = {};
  const rels = (doc.relationships ?? []).filter((r) => charIds.has(r.a) && charIds.has(r.b));
  if (rels.length) out.relationships = rels;
  if (doc.relationshipKinds) out.relationshipKinds = doc.relationshipKinds.map((k) => ({ ...k }));
  const layout = Object.fromEntries(Object.entries(doc.relationshipLayout ?? {}).filter(([id]) => charIds.has(id)));
  if (Object.keys(layout).length) out.relationshipLayout = layout;
  return out;
}

// ---- Reading (normalizeDoc) -------------------------------------------------------------

const text = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v : undefined;

/**
 * The project's kinds from a file. Never throws: a bad entry costs that kind.
 * Returns undefined for "absent" (the starters), and keeps an empty list as
 * "no kinds", which is different.
 */
export function readKinds(raw: unknown): RelationshipKind[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: RelationshipKind[] = [];
  for (const k of raw) {
    if (!k || typeof k !== "object") continue;
    const { id, name, color } = k as Record<string, unknown>;
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    const c = typeof color === "number" && Number.isFinite(color) ? Math.round(color) : 1;
    out.push({
      id,
      // A blank name is kept (it shows as "Unnamed kind"): the kind still colors its lines.
      name: typeof name === "string" ? name : "",
      color: Math.min(SWATCHES, Math.max(1, c)),
    });
  }
  return out;
}

/**
 * Relationships from a file. A tie whose character is gone (deleted on the
 * phone, say), a tie to oneself and a second record for the same pair are
 * dropped; a kind that names no kind is cleared, keeping the tie as "No kind".
 */
export function readRelationships(
  raw: unknown,
  charIds: Set<string>,
  kinds: RelationshipKind[]
): Relationship[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const kindIds = new Set(kinds.map((k) => k.id));
  const pairs = new Set<string>();
  const ids = new Set<string>();
  const out: Relationship[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const { id, a, b, kind, label, aView, bView, notes } = r as Record<string, unknown>;
    if (typeof id !== "string" || !id || ids.has(id)) continue;
    if (typeof a !== "string" || typeof b !== "string" || a === b) continue;
    if (!charIds.has(a) || !charIds.has(b)) continue;
    const key = pairKey(a, b);
    if (pairs.has(key)) continue;
    pairs.add(key);
    ids.add(id);
    out.push({
      id,
      a,
      b,
      ...(typeof kind === "string" && kindIds.has(kind) ? { kind } : {}),
      ...(text(label) ? { label: label as string } : {}),
      ...(text(aView) ? { aView: aView as string } : {}),
      ...(text(bView) ? { bView: bView as string } : {}),
      ...(text(notes) ? { notes: notes as string } : {}),
    });
  }
  return out.length ? out : undefined;
}

/** Chart positions from a file: only characters that exist, finite, clamped to the chart. */
export function readLayout(raw: unknown, charIds: Set<string>): Record<string, ChartPos> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, ChartPos> = {};
  for (const [id, p] of Object.entries(raw as Record<string, unknown>)) {
    if (!charIds.has(id) || !p || typeof p !== "object") continue;
    const { x, y } = p as Record<string, unknown>;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    out[id] = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * The three fields as `normalizeDoc` writes them: spread into the normalized
 * document, so an absent field stays absent.
 */
export function readRelationshipFields(
  d: { relationships?: unknown; relationshipKinds?: unknown; relationshipLayout?: unknown },
  charIds: Set<string>
): Pick<StoryDoc, "relationships" | "relationshipKinds" | "relationshipLayout"> {
  const kinds = readKinds(d.relationshipKinds);
  const relationships = readRelationships(d.relationships, charIds, kinds ?? STARTER_KINDS);
  const layout = readLayout(d.relationshipLayout, charIds);
  return {
    ...(relationships ? { relationships } : {}),
    ...(kinds ? { relationshipKinds: kinds } : {}),
    ...(layout ? { relationshipLayout: layout } : {}),
  };
}
