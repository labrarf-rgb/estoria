/**
 * Story-structure templates. Each beat is [title, act, summary?]; inserting a
 * template creates one chapter per beat, pre-sorted into acts and chained with
 * "therefore" connectors. The optional third element seeds the chapter's
 * one-line summary with a writing prompt (used by the life-story templates).
 *
 * Sources: the in-house "Narrative Frameworks and Story Structure Research"
 * compendium (Snyder, Campbell, Vogler, Harmon, Coyne, Kishotenketsu, Propp,
 * Natyasastra, Jo-ha-kyu); life-story templates from the "Biography and
 * Autobiography Story Mapping Templates" guide.
 */
export type TemplateBeat = [title: string, act: number, summary?: string];

export interface StoryTemplate {
  id: string;
  name: string;
  tag: string;
  blurb: string;
  /** Filter facets in the Templates modal. A template can belong to several
   *  (e.g. Vogler's Hero's Journey is both "Myth & journey" and "Screenwriting"). */
  groups: string[];
  beats: TemplateBeat[];
}

/** Facets shown in the Templates modal filter bar, in display order. "All" is
 *  added by the modal itself. */
export const TEMPLATE_GROUPS = [
  "Foundational",
  "Screenwriting",
  "Myth & journey",
  "World traditions",
  "Genre",
  "Life story",
] as const;

const RAW_TEMPLATES: Omit<StoryTemplate, "groups">[] = [
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
  {
    id: "bio-transformation",
    name: "The Transformation Memoir",
    tag: "Autobiography",
    blurb:
      "Best for autobiographies focused on a specific period of personal change, recovery, or internal growth rather than an entire lifetime.",
    beats: [
      ["The World As It Is", 1, "Establish your daily routine, your environment, and your baseline lifestyle before the major change occurred."],
      ["The Armor", 1, "Detail the specific coping mechanisms, flaws, or blind spots you relied on to get by at the time."],
      ["The Internal Fracture", 1, "Highlight the subtle, overlooked signs that your current way of living was becoming unsustainable."],
      ["The Day It Changed", 2, "Document the exact inciting incident or disruption (e.g., a diagnosis, layoff, or sudden loss) that shattered your reality."],
      ["The Aftershocks", 2, "Describe the immediate, chaotic fallout of that event and the sudden collapse of your stability."],
      ["Denying the Reality", 2, "Record your initial attempts to minimize the problem and pretend things could go back to normal."],
      ["The Familiar Fix", 2, "Detail your first attempt to solve the new problem using your old, flawed habits or logic."],
      ["Complications Multiply", 2, "Show how external pressure built up as that quick fix failed, causing new problems to compound."],
      ["Burning Bridges", 2, "Describe how your safety nets and close relationships strained or broke under the weight of the escalating crisis."],
      ["The Bottom", 2, "Capture the lowest point where your old mindset completely broke down and all remaining options ran out."],
      ["The Inventory", 3, "Document a period of forced isolation, assessment, and facing hard truths about yourself."],
      ["The First Step", 3, "Describe a small, awkward initial attempt at doing things differently and adopting a new approach."],
      ["The New Practice", 3, "Detail the process of building a new routine, environment, or philosophy through deliberate daily effort."],
      ["The Relapse Test", 3, "Show a temptation or crisis that threatened to pull you back into old habits, which you successfully resisted."],
      ["The Final Hurdle", 3, "Face a high-stakes situation that required your newly developed mindset to successfully resolve."],
      ["The New Baseline", 3, "Establish the closing status quo, showing the permanent internal change and how your life looks now."],
    ],
  },
  {
    id: "bio-innovator",
    name: "The Innovator's Quest",
    tag: "Biography",
    blurb:
      "Optimized for profiles of scientists, inventors, founders, and researchers whose lives revolve around solving a singular, complex problem.",
    beats: [
      ["The Spark", 1, "Explore the early origins of your curiosity and your first introduction to your chosen field."],
      ["The Blind Spot", 1, "Identify the specific, major problem or mystery that the rest of your industry or society was completely ignoring."],
      ["Stepping Off the Path", 1, "Walk away from traditional career security or standard methods to focus entirely on the central problem."],
      ["The Lone Laboratory", 1, "Detail setting up your initial, often underfunded operation and starting early experimentation."],
      ["False Horizons", 2, "Describe initial small successes that turned out to be dead ends, testing your resolve."],
      ["The Institutional Wall", 2, "Detail facing active skepticism, rejection of funding, or ridicule from established peers."],
      ["The Eleventh Hour", 2, "Capture running out of time, resources, or sanity right before the major turning point."],
      ["Eureka", 2, "Document the exact moment of discovery, creation, or market validation."],
      ["Proving the Math", 2, "Detail the grueling process of replicating the result and turning a raw breakthrough into a functional reality."],
      ["The Arena", 3, "Bring the innovation to the wider public and deal with the immediate market disruption."],
      ["The Counter-Attack", 3, "Show the institutional resistance, copycats, legal battles, or corporate sabotage designed to stop you."],
      ["The Personal Toll", 3, "Document the collateral damage of success on your relationships, health, or ideals."],
      ["Standard Operating Procedure", 3, "Show how your innovation became the new industry baseline, permanently changing how society operates."],
      ["The Elder Statesman", 3, "Detail your transition from a radical outsider to an established authority figure in the space."],
      ["Looking Over the Horizon", 3, "Share final reflections on what was built, what was lost, and the next unanswered question."],
    ],
  },
  {
    id: "bio-rags-to-riches",
    name: "The Rags-to-Riches Trajectory",
    tag: "Biography",
    blurb:
      "Designed for business titans, entertainment icons, and self-made public figures. It tracks the psychological weight of rapid upward mobility.",
    beats: [
      ["Scarcity", 1, "Establish the early environment of poverty, obscurity, or lack of opportunity that defined your youth."],
      ["The Chip on the Shoulder", 1, "Explore the specific early experiences or rejections that forged your intense drive to succeed."],
      ["The Ticket Out", 1, "Describe the discovery of a raw talent, skill, or market loophole that offered a way out of your circumstances."],
      ["Gatecrashing", 1, "Detail entering your industry or higher social circles as an outsider, securing early, unexpected wins."],
      ["Acceleration", 1, "Show how you mastered the rules of the game, scaled your operation, and outmaneuvered early rivals."],
      ["The Inner Circle", 2, "Explore trading old friends and familiar environments for a new tier of access, wealth, and influence."],
      ["View from the Top", 2, "Capture reaching the peak of wealth, fame, or power, along with the isolation that accompanied it."],
      ["The Blind Spot", 2, "Reveal the arrogance or systemic vulnerabilities that developed when you felt completely untouchable."],
      ["The Crash", 3, "Document a sudden, severe setback (e.g., bankruptcy, a public scandal, or massive betrayal) that stripped away your status."],
      ["In the Ashes", 3, "Deal with the immediate fallout, the loss of fair-weather allies, and intense public scrutiny."],
      ["Rebuilding the Core", 4, "Return to the foundational skills that brought early success, but without the original desperation."],
      ["Second Chance", 4, "Secure a more mature, stable form of success or redemption built on hard-earned wisdom rather than raw ambition."],
      ["Balancing the Ledger", 4, "Settle old scores, financial debts, or resolve relationships fractured during your rise and fall."],
      ["True Wealth", 4, "Redefine what success actually means to you outside of money, titles, or public validation."],
      ["The Retrospective", 4, "Look back directly at your starting point, evaluating the permanent cost of the entire journey."],
    ],
  },
  {
    id: "bio-adversary",
    name: "The Adversary Narrative",
    tag: "Memoir",
    blurb:
      "Ideal for political figures, activists, whistleblowers, and wartime memoirs. The entire structure is framed around opposition to an external force.",
    beats: [
      ["The Innocent Bystander", 1, "Detail your early life up until your first direct, undeniable encounter with systemic injustice, an enemy force, or a corrupt institution."],
      ["The Price of Silence", 1, "Explore the internal struggle between ignoring the issue for your own safety or stepping forward to act."],
      ["Crossing the Line", 1, "Document the definitive public act or decision that labeled you as an active enemy of the established system."],
      ["Finding the Underground", 2, "Locate, vet, and join forces with other dissidents, allies, or advocates who share your goal."],
      ["Weapon Selection", 2, "Detail developing the specific strategy, tools, communication channels, or legal frameworks needed to fight back."],
      ["The First Skirmish", 2, "Show an early test of your strategy that proved the adversary could be hurt, raising the stakes for everyone involved."],
      ["The System Strikes Back", 3, "Document the adversary deploying its full weight to crush your resistance (e.g., character assassination, legal threats, or arrests)."],
      ["Tightening the Circle", 3, "Trim down to a core group of trusted allies as external pressure mounts and fair-weather supporters defect."],
      ["The War of Attrition", 3, "Endure a long, exhausting period of small gains and major setbacks where simple survival is the only metric of success."],
      ["The Convergence", 3, "Show how external events forced a situation where a final, direct showdown became entirely unavoidable."],
      ["The Highest Stake", 4, "Capture the peak moment of confrontation (e.g., a critical vote, trial, or physical standoff) where everything was put on the line."],
      ["The Turning Point", 4, "Detail the precise moment the balance of power shifted decisively, breaking the adversary's hold."],
      ["Clearing the Rubble", 4, "Navigate the immediate, messy aftermath of the conflict and secure the ground you won."],
      ["Institutional Reconstruction", 4, "Document the hard work of building new rules, laws, or cultures to replace what you tore down."],
      ["The Scars", 4, "Frankly assess the permanent personal, emotional, or physical cost paid by you and your immediate allies."],
      ["The Guard Changed", 4, "Take a final look at the new world order, showing your place in the reality you fought to create."],
    ],
  },
];

/** Which facets each template belongs to (keyed by id). Kept beside the raw
 *  list so memberships are easy to retune; merged onto TEMPLATES below. */
const GROUP_MEMBERSHIP: Record<string, string[]> = {
  blank: ["Foundational"],
  "three-act": ["Foundational"],
  stc: ["Foundational", "Screenwriting"],
  "hero-vogler": ["Screenwriting", "Myth & journey"],
  "hero-campbell": ["Myth & journey"],
  "story-circle": ["Foundational", "Screenwriting", "Myth & journey"],
  "story-grid": ["Screenwriting"],
  kishotenketsu: ["World traditions"],
  romance: ["Genre"],
  mystery: ["Genre"],
  propp: ["Myth & journey", "World traditions"],
  panchasandhi: ["World traditions"],
  "jo-ha-kyu": ["World traditions"],
  "bio-transformation": ["Life story"],
  "bio-innovator": ["Life story"],
  "bio-rags-to-riches": ["Life story"],
  "bio-adversary": ["Life story"],
};

export const TEMPLATES: StoryTemplate[] = RAW_TEMPLATES.map((t) => ({
  ...t,
  groups: GROUP_MEMBERSHIP[t.id] ?? [],
}));
