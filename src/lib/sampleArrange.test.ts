import { describe, expect, it } from "vitest";
import { sampleStory } from "@/data/sampleStory";
import { CARD_W, GRID_GAP_X, autoArrange, bestColumns } from "@/lib/layout";
import { docHasContent, useStore } from "@/store/useStore";
import type { StoryDoc } from "@/types";

/**
 * A fresh start opens on an arranged board (2026-11-27). The sample is also the
 * store's default document, which is what shows behind Welcome and after a
 * failed load's "Continue without saving", so it ships pre-arranged rather than
 * in its authored two-row zigzag.
 */
describe("sample story ships arranged", () => {
  const pos = (d: { chapters: StoryDoc["chapters"] }) => d.chapters.map(({ id, x, y, rot }) => ({ id, x, y, rot }));

  it("sits on Auto-arrange's first 4-column pass", () => {
    expect(pos(sampleStory)).toEqual(pos(autoArrange(sampleStory.chapters, 0, 4)));
  });

  it("is a 4 x 2 map, not a long line", () => {
    const cols = new Set(sampleStory.chapters.map((c) => Math.round(c.x / (CARD_W + GRID_GAP_X))));
    expect(cols.size).toBe(4);
    const width = Math.max(...sampleStory.chapters.map((c) => c.x)) + CARD_W;
    expect(width).toBeLessThan(4 * (CARD_W + GRID_GAP_X) + 100);
  });

  it("gives the Alt ending the same positions as the main draft", () => {
    expect(pos(sampleStory.draftData.alt)).toEqual(pos(sampleStory));
  });

  it("is still the untouched default, so Welcome asks no questions", () => {
    expect(useStore.getState().doc).toBe(sampleStory);
    expect(docHasContent(sampleStory)).toBe(false);
  });

  it("never rearranges a saved layout on hydrate", () => {
    const saved: StoryDoc = {
      ...sampleStory,
      id: "mine",
      chapters: sampleStory.chapters.map((c, i) => ({ ...c, x: 1000 + i * 7, y: -40 * i, rot: 0 })),
    };
    const merged = useStore.persist.getOptions().merge!({ doc: saved, onboarded: true }, useStore.getState()) as {
      doc: StoryDoc;
    };
    expect(pos(merged.doc)).toEqual(pos(saved));
  });

  it("Explore the sample still sizes the arrange to the window", () => {
    useStore.getState().setBoardSize(2000, 900);
    useStore.getState().useSample();
    const s = useStore.getState();
    expect(s.onboarded).toBe(true);
    expect(s.arrangeN).toBe(1);
    // Same pass the toolbar button would make on this board (3 columns here).
    const cols = bestColumns(sampleStory.chapters.length, 2000, 900);
    expect(cols).toBe(3);
    expect(pos(s.doc)).toEqual(pos(autoArrange(sampleStory.chapters, 0, cols)));
    expect(pos(s.doc.draftData.alt)).toEqual(pos(s.doc));
  });
});
