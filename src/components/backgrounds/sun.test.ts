import { describe, expect, it } from "vitest";
import { parseClock, sunMinutes, sunPoint, sunProgress, sunProgressAt } from "./sun";

describe("sunProgress", () => {
  const cases: [string, number, number, number][] = [
    // clock, hours, minutes, expected progress (0 = 6:00, 0.5 = noon, 1 = 18:00)
    ["6:00", 6, 0, 0],
    ["9:00", 9, 0, 0.25],
    ["12:00", 12, 0, 0.5],
    ["15:00", 15, 0, 0.75],
    ["18:00", 18, 0, 1],
    ["21:30 reads as 9:30", 21, 30, 210 / 720],
    ["23:59 reads as 11:59", 23, 59, 359 / 720],
    ["0:30 holds at 6:00", 0, 30, 0],
    ["5:59 holds at 6:00", 5, 59, 0],
  ];

  it.each(cases)("%s", (_label, h, m, expected) => {
    expect(sunProgress(h, m)).toBeCloseTo(expected, 10);
  });

  it("reads night times as the same clock reading in the morning", () => {
    expect(sunMinutes(21, 30)).toBe(9 * 60 + 30);
    expect(sunMinutes(18, 1)).toBe(6 * 60 + 1);
    expect(sunMinutes(23, 0)).toBe(11 * 60);
  });

  it("takes a Date in local time", () => {
    const d = new Date();
    d.setHours(15, 0, 0, 0);
    expect(sunProgressAt(d)).toBe(0.75);
  });
});

describe("sunPoint", () => {
  it("rises from low left to top center and sets low right", () => {
    const morning = sunPoint(0);
    const noon = sunPoint(0.5);
    const evening = sunPoint(1);
    expect(morning.x).toBeLessThan(0.05);
    expect(evening.x).toBeGreaterThan(0.95);
    expect(noon.x).toBeCloseTo(0.5, 10);
    expect(noon.y).toBeLessThan(0); // just above the top edge
    expect(morning.y).toBeCloseTo(evening.y, 10);
    expect(morning.y).toBeGreaterThan(0.5);
  });

  it("is warmest at the ends of the day", () => {
    expect(sunPoint(0).warmth).toBeCloseTo(1, 10);
    expect(sunPoint(0.5).warmth).toBeCloseTo(0, 10);
    expect(sunPoint(0.25).warmth).toBeGreaterThan(0);
  });

  it("clamps out-of-range progress", () => {
    expect(sunPoint(-1)).toEqual(sunPoint(0));
    expect(sunPoint(2)).toEqual(sunPoint(1));
  });
});

describe("parseClock", () => {
  it("parses H:MM and HH:MM", () => {
    expect(parseClock("9:30")?.getHours()).toBe(9);
    expect(parseClock("21:05")?.getMinutes()).toBe(5);
  });

  it("rejects anything else", () => {
    for (const bad of [null, undefined, "", "noon", "24:00", "9:60", "930"]) {
      expect(parseClock(bad)).toBeNull();
    }
  });
});
