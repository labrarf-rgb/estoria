import type { AuthorContact, AuthorDetails, StoryDoc } from "@/types";

/**
 * Author details: one shape for the editor and the saved default, split across
 * `StoryDoc.author` (the byline) and `StoryDoc.authorContact` on a project.
 *
 * Values are kept exactly as typed so the cursor never jumps while someone is
 * writing; a field that is only whitespace counts as empty and is dropped, and
 * the export trims what it prints.
 */

export const CONTACT_FIELDS = ["legalName", "address", "phone", "email", "website"] as const;
export const AUTHOR_FIELDS = ["byline", ...CONTACT_FIELDS] as const;
export type AuthorField = (typeof AUTHOR_FIELDS)[number];

/** Drop every field that is empty or only whitespace. */
export function cleanAuthor(d: AuthorDetails): AuthorDetails {
  const out: AuthorDetails = {};
  for (const k of AUTHOR_FIELDS) {
    const v = d[k];
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return out;
}

export const hasAuthor = (d: AuthorDetails): boolean => Object.keys(cleanAuthor(d)).length > 0;

/** Same details, ignoring empty fields and surrounding whitespace. */
export function sameAuthor(a: AuthorDetails, b: AuthorDetails): boolean {
  return AUTHOR_FIELDS.every((k) => (a[k] ?? "").trim() === (b[k] ?? "").trim());
}

/** A project's details, read back into the editor's shape. */
export function authorOf(doc: StoryDoc): AuthorDetails {
  return cleanAuthor({ byline: doc.author, ...doc.authorContact });
}

/** The project with its details replaced. Empty fields leave no key behind. */
export function withAuthor(doc: StoryDoc, details: AuthorDetails): StoryDoc {
  const { byline, ...contact } = cleanAuthor(details);
  const next: StoryDoc = { ...doc, author: byline, authorContact: contact };
  if (!byline) delete next.author;
  if (Object.keys(contact).length === 0) delete next.authorContact;
  return next;
}

/** Read an `authorContact` from a file, keeping only string fields with text. */
export function readContact(raw: unknown): AuthorContact | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: AuthorContact = {};
  for (const k of CONTACT_FIELDS) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The name to print on the byline: the byline, else the legal name. */
export const bylineOf = (d: AuthorDetails): string => (d.byline || d.legalName || "").trim();

/**
 * The title page's top-left block, one entry per line: legal name (or the
 * byline when there is no separate legal name), then address, phone, email,
 * website. Empty when nothing is set, so no name is ever invented.
 */
export function contactLines(d: AuthorDetails): string[] {
  const name = (d.legalName || d.byline || "").trim();
  const lines = name ? [name] : [];
  for (const l of (d.address ?? "").split("\n")) if (l.trim()) lines.push(l.trim());
  for (const k of ["phone", "email", "website"] as const) {
    const v = (d[k] ?? "").trim();
    if (v) lines.push(v);
  }
  return lines;
}

/** What each field is called on screen and in a sync comparison. */
export const AUTHOR_LABELS: Record<AuthorField, string> = {
  byline: "byline",
  legalName: "legal name",
  address: "address",
  phone: "phone",
  email: "email",
  website: "website",
};
