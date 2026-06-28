/**
 * Story-structure templates. Each beat is [title, act]; inserting a template
 * creates one chapter per beat, pre-sorted into acts and chained with
 * "therefore" connectors.
 *
 * Sources: the in-house "Narrative Frameworks and Story Structure Research"
 * compendium (Snyder, Campbell, Vogler, Harmon, Coyne, Kishotenketsu, Propp,
 * Natyasastra, Jo-ha-kyu).
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
    id: "blank",
    name: "Single Blank Chapter",
    tag: "Minimal",
    blurb: "Just one empty chapter to start from scratch.",
    beats: [["Untitled Chapter", 1]],
  },
  {
    id: "three-act",
    name: "Three-Act Structure",
    tag: "Classic",
    blurb: "Setup, confrontation, resolution: the bones of most stories.",
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
    id: "stc",
    name: "Save the Cat",
    tag: "15 beats",
    blurb: "Snyder's beat sheet: tight, commercial pacing.",
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
    id: "hero-vogler",
    name: "Hero's Journey (Vogler)",
    tag: "12 stages",
    blurb: "Vogler's screenwriting adaptation of the monomyth, aligned to three acts.",
    beats: [
      ["The Ordinary World", 1],
      ["The Call to Adventure", 1],
      ["Refusal of the Call", 1],
      ["Meeting with the Mentor", 1],
      ["Crossing the First Threshold", 2],
      ["Tests, Allies, and Enemies", 2],
      ["Approach to the Inmost Cave", 2],
      ["The Ordeal", 2],
      ["The Reward (Seizing the Sword)", 2],
      ["The Road Back", 3],
      ["The Resurrection", 3],
      ["Return with the Elixir", 3],
    ],
  },
  {
    id: "hero-campbell",
    name: "Hero's Journey (Campbell)",
    tag: "17 stages",
    blurb: "Campbell's full monomyth: Departure, Initiation, Return.",
    beats: [
      // Departure
      ["The Call to Adventure", 1],
      ["Refusal of the Call", 1],
      ["Supernatural Aid", 1],
      ["Crossing the First Threshold", 1],
      ["Belly of the Whale", 1],
      // Initiation
      ["The Road of Trials", 2],
      ["Meeting with the Goddess", 2],
      ["Temptation", 2],
      ["Atonement with the Father", 2],
      ["Apotheosis", 2],
      ["The Ultimate Boon", 2],
      // Return
      ["Refusal of the Return", 3],
      ["The Magic Flight", 3],
      ["Rescue from Without", 3],
      ["Crossing the Return Threshold", 3],
      ["Master of Two Worlds", 3],
      ["Freedom to Live", 3],
    ],
  },
  {
    id: "story-circle",
    name: "Dan Harmon's Story Circle",
    tag: "8 steps",
    blurb: "A closed loop: comfort, desire, descent, and changed return.",
    beats: [
      ["You (comfort zone)", 1],
      ["Need (a want)", 1],
      ["Go (cross the threshold)", 2],
      ["Search (adapt)", 2],
      ["Find (get what they wanted)", 2],
      ["Take (pay the price)", 3],
      ["Return (back to the familiar)", 3],
      ["Change (transformed)", 3],
    ],
  },
  {
    id: "story-grid",
    name: "Story Grid: Five Commandments",
    tag: "Coyne",
    blurb: "Coyne's scale-invariant unit: incident, complications, crisis, climax, resolution.",
    beats: [
      ["Inciting Incident", 1],
      ["Progressive Complications", 2],
      ["Turning Point", 2],
      ["Crisis (best bad / irreconcilable)", 2],
      ["Climax", 3],
      ["Resolution", 3],
    ],
  },
  {
    id: "kishotenketsu",
    name: "Kishotenketsu",
    tag: "4-act, no conflict",
    blurb: "East Asian four-act structure built on a twist and reconciliation, not conflict.",
    beats: [
      ["Ki (Introduction)", 1],
      ["Sho (Development)", 2],
      ["Ten (Twist)", 3],
      ["Ketsu (Reconciliation)", 4],
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
    id: "propp",
    name: "Propp's Morphology",
    tag: "Folktale",
    blurb: "Propp's recurring folktale functions, in their fixed order.",
    beats: [
      ["Absentation", 1],
      ["Interdiction", 1],
      ["Violation", 1],
      ["Villainy or Lack", 1],
      ["Mediation (call to action)", 1],
      ["Departure", 2],
      ["The Donor's Test", 2],
      ["Hero's Reaction", 2],
      ["Receipt of a Magical Agent", 2],
      ["Struggle with the Villain", 2],
      ["Victory", 3],
      ["Liquidation of the Lack", 3],
      ["Return", 3],
      ["Reward", 3],
    ],
  },
  {
    id: "panchasandhi",
    name: "Sanskrit Panchasandhi",
    tag: "Natyasastra",
    blurb: "The five junctures of classical Indian drama, from seed to fruition.",
    beats: [
      ["Mukha (Opening / seed)", 1],
      ["Pratimukha (Progression)", 1],
      ["Garbha (Development)", 2],
      ["Vimarsha (Pause / crisis)", 2],
      ["Nirvahana (Conclusion)", 3],
    ],
  },
  {
    id: "jo-ha-kyu",
    name: "Jo-ha-kyu",
    tag: "Pacing",
    blurb: "Japanese tempo: slow beginning, accelerating break, rapid climax.",
    beats: [
      ["Jo (slow beginning)", 1],
      ["Ha (the break, accelerating)", 2],
      ["Kyu (rapid climax)", 3],
    ],
  },
];
