/**
 * Story-structure templates. Each beat is [title, act]; inserting a template
 * creates one chapter per beat, pre-sorted into acts and chained with
 * "therefore" connectors.
 */
export interface StoryTemplate {
  id: string;
  name: string;
  tag: string;
  blurb: string;
  beats: [string, number][];
}

export const TEMPLATES: StoryTemplate[] = [
  {
    id: "three-act",
    name: "Three-Act Structure",
    tag: "Classic",
    blurb: "Setup, confrontation, resolution — the bones of most stories.",
    beats: [
      ["Opening Image", 1],
      ["Inciting Incident", 1],
      ["Plot Point I", 1],
      ["Rising Action", 2],
      ["Midpoint", 2],
      ["Plot Point II", 2],
      ["Climax", 3],
      ["Resolution", 3],
    ],
  },
  {
    id: "hero",
    name: "Hero's Journey",
    tag: "12 stages",
    blurb: "Campbell’s monomyth — call, threshold, ordeal, return.",
    beats: [
      ["Ordinary World", 1],
      ["Call to Adventure", 1],
      ["Refusal of the Call", 1],
      ["Meeting the Mentor", 1],
      ["Crossing the Threshold", 2],
      ["Tests, Allies, Enemies", 2],
      ["Approach", 2],
      ["The Ordeal", 2],
      ["Reward", 2],
      ["The Road Back", 3],
      ["Resurrection", 3],
      ["Return with the Elixir", 3],
    ],
  },
  {
    id: "stc",
    name: "Save the Cat",
    tag: "15 beats",
    blurb: "Snyder’s beat sheet — tight, commercial pacing.",
    beats: [
      ["Opening Image", 1],
      ["Theme Stated", 1],
      ["Setup", 1],
      ["Catalyst", 1],
      ["Debate", 1],
      ["Break into Two", 2],
      ["B Story", 2],
      ["Fun and Games", 2],
      ["Midpoint", 2],
      ["Bad Guys Close In", 2],
      ["All Is Lost", 2],
      ["Dark Night of the Soul", 2],
      ["Break into Three", 3],
      ["Finale", 3],
      ["Final Image", 3],
    ],
  },
  {
    id: "romance",
    name: "Romance Beat Sheet",
    tag: "Genre",
    blurb: "Meet, spark, rupture, grand gesture, HEA.",
    beats: [
      ["Meet Cute", 1],
      ["No Way / Adhesion", 1],
      ["Falling in Love", 2],
      ["Midpoint of Love", 2],
      ["The Rupture", 2],
      ["Dark Moment", 2],
      ["Grovel / Grand Gesture", 3],
      ["Happily Ever After", 3],
    ],
  },
  {
    id: "mystery",
    name: "Mystery / Whodunit",
    tag: "Genre",
    blurb: "Crime, clues, red herrings, reveal.",
    beats: [
      ["The Crime", 1],
      ["Detective Enters", 1],
      ["First Clues", 1],
      ["Red Herring", 2],
      ["Complication", 2],
      ["Midpoint Twist", 2],
      ["The Breakthrough", 2],
      ["Confrontation", 3],
      ["The Reveal", 3],
    ],
  },
  {
    id: "blank",
    name: "Single Blank Chapter",
    tag: "Minimal",
    blurb: "Just one empty chapter to start from scratch.",
    beats: [["Untitled Chapter", 1]],
  },
];
