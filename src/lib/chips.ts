import type { Character } from "@/types";

/**
 * Chapter cards are fixed-width, so the character stack only has room for so
 * many chips before it runs off the card. Past that the last slot becomes a
 * "+n" counter — the narrowest card (the horizontal timeline rail, 234px) fits
 * seven 21px chips with the overlap, so that's the shared budget.
 */
export const CHIP_SLOTS = 7;

/** Split a chapter's cast into the chips that fit and the ones a "+n" stands for. */
export function chipSplit(chars: Character[], slots = CHIP_SLOTS) {
  if (chars.length <= slots) return { shown: chars, rest: [] as Character[] };
  return { shown: chars.slice(0, slots - 1), rest: chars.slice(slots - 1) };
}

/** Tooltip for the "+n" chip: who it's hiding. */
export function chipRestLabel(rest: Character[]): string {
  return rest.map((k) => k.name || k.initials || "?").join(", ");
}
