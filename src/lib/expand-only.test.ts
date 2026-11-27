import { describe, expect, it } from "vitest";
import { normalizeDoc } from "@/store/persistence";
import { RETIRED_PREFS, useStore } from "@/store/useStore";

/**
 * Expand-only (2026-11-26): the panels' and both chapter modals' size toggles
 * are gone. A shell saved before then may still say `false` for either; it must
 * hydrate cleanly and never be written back.
 */
describe("retired size prefs", () => {
  const opts = useStore.persist.getOptions();
  const stored = {
    theme: "dark",
    charsView: "chart",
    panelExpanded: false,
    sceneFlowExpanded: false,
    manuscriptExpanded: false,
  };

  it("drops the three size prefs on hydrate, keeps the rest", () => {
    const merged = opts.merge!(stored, useStore.getState()) as unknown as Record<string, unknown>;
    for (const k of RETIRED_PREFS) expect(k in merged).toBe(false);
    expect(merged.theme).toBe("dark");
    expect(merged.charsView).toBe("chart");
    // Actions survive the merge.
    expect(typeof merged.setChapterTab).toBe("function");
  });

  it("hydrates from nothing stored", () => {
    const merged = opts.merge!(undefined, useStore.getState()) as unknown as Record<string, unknown>;
    expect(merged.theme).toBe(useStore.getState().theme);
  });

  it("never writes them back", () => {
    const saved = opts.partialize!(useStore.getState()) as Record<string, unknown>;
    for (const k of RETIRED_PREFS) expect(k in saved).toBe(false);
    expect("beatRailHidden" in saved).toBe(true);
  });

  it("drops the see-through cards experiment's level, whatever was stored", () => {
    for (const v of [30, 100, "60", null, { x: 1 }]) {
      const merged = opts.merge!({ theme: "light", sceneSolidA: v }, useStore.getState()) as unknown as Record<string, unknown>;
      expect("sceneSolidA" in merged).toBe(false);
      expect(merged.theme).toBe("light");
    }
  });

  it("is not in the store's state at all", () => {
    const state = useStore.getState() as unknown as Record<string, unknown>;
    for (const k of RETIRED_PREFS) expect(k in state).toBe(false);
    expect("setPanelExpanded" in state).toBe(false);
    expect("setSceneFlowExpanded" in state).toBe(false);
    expect("setManuscriptExpanded" in state).toBe(false);
  });
});

/**
 * The collapsed canvas is gone from the web, but its layout (`scenePosCompact`,
 * schema v6) is document data: the phone carries it and its RoundTripTest
 * checks it. Every scene edit must keep writing it alongside `scenePos`.
 */
describe("scenePosCompact is still written", () => {
  const doc = () =>
    normalizeDoc({
      id: "p1",
      projectTitle: "P",
      chapters: [{ id: "c1", num: 1, title: "One", scenes: ["a", "b", "c"], chars: [], refs: [] }],
    });
  const ch = () => useStore.getState().doc.chapters.find((c) => c.id === "c1")!;

  it("on open, add, insert, reorder and delete", () => {
    useStore.setState({ doc: doc() });
    const st = useStore.getState();
    const check = (n: number) => {
      expect(ch().scenes.length).toBe(n);
      expect(ch().scenePos?.length).toBe(n);
      expect(ch().scenePosCompact?.length).toBe(n);
    };
    st.openChapter("c1");
    check(3);
    st.addScene("c1", 5);
    check(4);
    st.insertScene("c1", 1, 5);
    check(5);
    st.reorderScene("c1", 0, 3, 5);
    check(5);
    st.deleteScene("c1", 2);
    check(4);
    st.closeChapter();
  });

  it("lays the compact copy out for the old 980px canvas, not the wide one", () => {
    useStore.setState({ doc: doc() });
    // Ten scenes at 5 measured columns make 2 rows wide. The compact copy is
    // estimated for the old canvas (980px less padding, about 3 columns), so it
    // needs more rows.
    for (let i = 0; i < 7; i++) useStore.getState().addScene("c1", 5);
    const rows = (p: { y: number }[] = []) => new Set(p.map((v) => v.y)).size;
    expect(rows(ch().scenePos)).toBe(2);
    expect(rows(ch().scenePosCompact)).toBeGreaterThan(2);
  });
});
