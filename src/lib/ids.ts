/**
 * Ids for new records. Shared by the store and by the components that hold a
 * *draft* record before it exists in the document (see `lib/prune.ts` for the
 * rule): a draft is rendered under the id it will keep once it's committed, so
 * React reuses the same DOM node and the keystroke that created the record
 * doesn't blur the field you're typing in.
 */
export const uid = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
