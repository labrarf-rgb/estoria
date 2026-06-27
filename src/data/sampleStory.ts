import { MAIN_DRAFT_ID, SCHEMA_VERSION, type StoryDoc } from "@/types";

/**
 * "The Drowned Map" - the sample story from the design prototype. Used as the
 * default document on first load so the board is never empty. Replace via
 * templates, import, or "New".
 */
export const sampleStory: StoryDoc = {
  schemaVersion: SCHEMA_VERSION,
  id: "drowned-map",
  projectTitle: "Untitled Voyage",
  seriesMode: false,

  drafts: [
    { id: MAIN_DRAFT_ID, name: "Main draft" },
    { id: "alt", name: "Alt ending" },
  ],
  activeDraftId: MAIN_DRAFT_ID,

  characters: [
    {
      id: "wren",
      name: "Wren Calloway",
      role: "Protagonist",
      type: "Hero",
      initials: "WC",
      color: "oklch(0.60 0.10 215)",
      desc: "A cartographer who can chart any coast but her own way home.",
      bio: "Raised in the lamp-lit map shops of the lower city; learned to read water before she could read words.",
      traits: ["Stubborn", "Precise", "Haunted"],
      goals: ["Reach the harbor on her mother's map", "Keep Bram and Pip alive"],
      motivations: "Grief she has never named, and the suspicion her mother is still out there.",
      want: "To reach the harbor from her mother's last map.",
      need: "To stop running from the people who love her.",
      notes: "Left-handed; signs every chart with a tiny anchor.",
    },
    {
      id: "sela",
      name: "Sela Voss",
      role: "Antagonist",
      type: "Shadow",
      initials: "SV",
      color: "oklch(0.58 0.15 30)",
      desc: "Wren's former mentor, now harbormaster of a city that forgives no debts.",
      bio: "Rose from dockhand to harbormaster by knowing exactly which debts to forgive.",
      traits: ["Patient", "Ruthless", "Wounded"],
      goals: ["Recover the map", "Bring Wren back into the fold"],
      motivations: "Believes the map is the only thing Wren's mother left for HER.",
      want: "To reclaim the map she believes is hers.",
      need: "To admit she drove Wren away.",
      notes: "Keeps Wren's old apprentice mug on her desk.",
    },
    {
      id: "bram",
      name: "Bram Okonkwo",
      role: "Ally",
      type: "Companion",
      initials: "BO",
      color: "oklch(0.62 0.12 85)",
      desc: "A navigator who has sailed everywhere except toward the truth.",
      bio: "Knows every route on the eastern charts; never speaks of the False Harbor run.",
      traits: ["Loyal", "Evasive", "Brave"],
      goals: ["Protect Wren", "Outrun his past"],
      motivations: "Guilt; he piloted the ship that doomed the last expedition.",
      want: "To keep Wren safe.",
      need: "To confess what he did at the False Harbor.",
      notes: "Hums when he lies.",
    },
    {
      id: "pip",
      name: "Pip",
      role: "Catalyst",
      type: "Trickster",
      initials: "P",
      color: "oklch(0.56 0.12 305)",
      desc: "A dock-rat who trades in secrets and stolen tide-charts.",
      bio: "Grew up fencing tide-charts in the gull markets; no one knows her real name.",
      traits: ["Quick", "Guarded", "Kind"],
      goals: ["Earn passage out", "Be believed"],
      motivations: "Wants, for once, to be on the right side of a secret.",
      want: "A way off the docks.",
      need: "To trust one adult.",
      notes: "Counts the exits in every room.",
    },
  ],
  world: [
    {
      id: "w1",
      cat: "Place",
      name: "The Lower City",
      desc: "A tide-flooded port built on the drowned bones of an older one.",
      notes: "Streets renumber themselves at high water; locals navigate by smell and habit.",
      refs: [
        { id: "r-w1-1", kind: "IMAGE", label: "City skyline" },
        { id: "r-w1-2", kind: "NOTE", label: "Tide schedule", body: "High water at dawn and dusk." },
      ],
    },
    {
      id: "w2",
      cat: "Place",
      name: "The False Harbor",
      desc: "A sheltered harbor that appears only on Wren's mother's map.",
      notes: "Safe, until it isn't. The walls remember who enters.",
      refs: [{ id: "r-w2-1", kind: "NOTE", label: "Rules of the harbor", body: "" }],
    },
    {
      id: "w3",
      cat: "Faction",
      name: "Harbormasters' Guild",
      desc: "Keepers of every debt, dock, and departure in the city.",
      notes: "Sela's power base. Nothing leaves port without their mark.",
      refs: [],
    },
    {
      id: "w4",
      cat: "Lore",
      name: "Living Maps",
      desc: "Charts inked with tide-salt that quietly redraw themselves.",
      notes: "Only a handful of cartographers can still read them; fewer can draw one.",
      refs: [{ id: "r-w4-1", kind: "IMAGE", label: "Salt-ink sample" }],
    },
  ],
  assets: [],

  books: [
    {
      id: "b1",
      title: "The Drowned Map",
      subtitle: "Book One",
      status: "drafting",
      premise: "A cartographer chasing her dead mother's impossible map down a coast that rewrites itself.",
      arc: "Wren learns the map is real, and that she drew the parts that hurt most.",
    },
    {
      id: "b2",
      title: "The Salt Road",
      subtitle: "Book Two",
      status: "planned",
      premise: "With the harbor found, Wren must chart a route no one is meant to survive twice.",
      arc: "The cost of the first map comes due; Bram's secret reshapes the crew.",
    },
    {
      id: "b3",
      title: "True North",
      subtitle: "Book Three",
      status: "idea",
      premise: "The last coastline. The last lie. Wren decides what home is worth keeping.",
      arc: "Resolution of the mother thread; Pip inherits the trade.",
    },
  ],
  activeBookId: "b1",

  storyNotes:
    "Working themes\n- home is a thing you make, not a place you find.\n- every map is a kind of lie you agree to believe.\n\nOpen questions\n- Does Wren's mother appear, or only her hand on the charts?\n- How much of the False Harbor is real?\n\nPacing note\nAct II sags around Ch 5; consider moving Pip's confession earlier.",

  chapters: [
    {
      id: "c1", num: 1, act: 1, status: "done", title: "The Drowned Map", words: 3200,
      x: 60, y: 70, chars: ["wren", "pip"],
      scenes: [
        "Wren haggles for a water-ruined chart at the night market.",
        "She recognizes her mother's hand inking the margins.",
        "The coastline rearranges itself when the paper gets wet.",
      ],
      sceneLinks: ["but", "therefore"],
      refs: [
        { id: "r-c1-1", kind: "IMAGE", label: "Tide-chart sketch" },
        { id: "r-c1-2", kind: "NOTE", label: "Map symbology key", body: "Anchor = safe; gull = warning." },
      ],
    },
    {
      id: "c2", num: 2, act: 1, status: "done", title: "A Door in the Floor", words: 2800,
      x: 360, y: 252, chars: ["wren", "bram"],
      scenes: [
        "Wren follows the chart down to a flooded cellar.",
        "A trapdoor opens onto water that flows uphill.",
        "Bram drags her out before the tide takes the shop.",
      ],
      sceneLinks: ["therefore", "but"],
      refs: [{ id: "r-c2-1", kind: "NOTE", label: "Cellar floorplan", body: "" }],
    },
    {
      id: "c3", num: 3, act: 1, status: "draft", title: "The Mentor's Shadow", words: 3100,
      x: 660, y: 70, chars: ["wren", "sela"],
      scenes: [
        "Sela is waiting in the ruins of Wren's shop.",
        "She offers protection in exchange for the map.",
        "Wren refuses and burns the only copy she'll admit to.",
      ],
      sceneLinks: ["therefore", "but"],
      refs: [{ id: "r-c3-1", kind: "IMAGE", label: "Sela reference" }],
    },
    {
      id: "c4", num: 4, act: 2, status: "draft", title: "Crossing the Salt", words: 3600,
      x: 960, y: 252, chars: ["wren", "bram", "pip"],
      scenes: [
        "The three flee the city by salt-barge.",
        "Pip stows away and reveals she's hunted too.",
        "A storm strands them on an uncharted bar.",
      ],
      sceneLinks: ["and", "therefore"],
      refs: [{ id: "r-c4-1", kind: "NOTE", label: "Barge crew notes", body: "" }],
    },
    {
      id: "c5", num: 5, act: 2, status: "idea", title: "The False Harbor", words: 4100,
      x: 1260, y: 70, chars: ["wren", "sela", "bram"],
      scenes: [
        "A welcoming harbor takes them in.",
        "Wren realizes it only exists on her mother's map.",
        "Sela's agents are already inside the walls.",
      ],
      sceneLinks: ["but", "therefore"],
      refs: [
        { id: "r-c5-1", kind: "IMAGE", label: "Harbor matte" },
        { id: "r-c5-2", kind: "NOTE", label: "Who betrays whom", body: "" },
      ],
    },
    {
      id: "c6", num: 6, act: 2, status: "idea", title: "What Pip Knew", words: 2400,
      x: 1560, y: 252, chars: ["wren", "pip"],
      scenes: [
        "Pip confesses she sold Wren's route once before.",
        "It explains how Sela always arrives first.",
        "Wren forgives her, and means it.",
      ],
      sceneLinks: ["therefore", "therefore"],
      refs: [],
    },
    {
      id: "c7", num: 7, act: 3, status: "idea", title: "The Long Dark", words: 3900,
      x: 1860, y: 70, chars: ["wren", "bram", "sela"],
      scenes: [
        "Bram's secret at the False Harbor breaks open.",
        "The group fractures on the open water.",
        "Wren is left alone with the map and a choice.",
      ],
      sceneLinks: ["but", "but"],
      refs: [{ id: "r-c7-1", kind: "NOTE", label: "Bram backstory", body: "" }],
    },
    {
      id: "c8", num: 8, act: 3, status: "idea", title: "The True North", words: 4500,
      x: 2160, y: 252, chars: ["wren", "sela", "pip", "bram"],
      summary: "Wren reaches the harbor and decides what home is worth.",
      overrides: {
        alt: {
          title: "The Drowned Return",
          summary: "Wren reaches the harbor only to choose the sea over the shore.",
        },
      },
      scenes: [
        "Wren sails into the harbor that shouldn't exist.",
        "She faces Sela on the impossible quay.",
        "She redraws the map, and the coastline with it.",
      ],
      sceneLinks: ["therefore", "therefore"],
      refs: [{ id: "r-c8-1", kind: "IMAGE", label: "Final harbor" }],
    },
  ],
  links: [
    { fromId: "c1", toId: "c2", type: "therefore" },
    { fromId: "c2", toId: "c3", type: "but" },
    { fromId: "c3", toId: "c4", type: "therefore" },
    { fromId: "c4", toId: "c5", type: "and" },
    { fromId: "c5", toId: "c6", type: "but" },
    { fromId: "c6", toId: "c7", type: "therefore" },
    { fromId: "c7", toId: "c8", type: "therefore" },
  ],

  bookData: {
    b2: { chapters: [], links: [], storyNotes: "" },
    b3: { chapters: [], links: [], storyNotes: "" },
  },
};
