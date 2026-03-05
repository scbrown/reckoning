/**
 * Chronicle & Trial Types (Pillar 4)
 *
 * The Living Chronicle is an AI historian with bias — it writes the
 * adventure from a perspective the player doesn't control. NPCs hear
 * about the player through the Chronicle's lens.
 *
 * The Trial is a judgment system where the player's actions are
 * examined through charges, testimony, and a verdict archetype.
 */

// =============================================================================
// Chronicle (Biased Historian)
// =============================================================================

/** The narrator's bias toward the player */
export type NarratorBias =
  | 'sympathetic'  // Generous interpretation, finds good in bad acts
  | 'hostile'      // Harsh interpretation, finds fault in good acts
  | 'detached'     // Clinical, factual, no emotional coloring
  | 'mocking'      // Sardonic, finds irony and absurdity everywhere
  | 'tragic';      // Sees everything as leading to inevitable doom

/** A chronicle entry — the narrator's biased account of events */
export interface ChronicleEntry {
  id: string;
  gameId: string;
  /** Turn range this entry covers */
  turnStart: number;
  turnEnd: number;
  /** The narrator's biased account */
  content: string;
  /** Narrator bias applied */
  bias: NarratorBias;
  /** Source event IDs that this entry covers */
  sourceEventIds: string[];
  /** Reputation impact: how this entry affects NPC perception (-1 to 1) */
  reputationImpact: number;
  /** DM can override the chronicle text */
  dmOverride?: string;
  createdAt: string;
}

/** Input for generating a new chronicle entry */
export interface CreateChronicleInput {
  gameId: string;
  turnStart: number;
  turnEnd: number;
  content: string;
  bias: NarratorBias;
  sourceEventIds: string[];
  reputationImpact: number;
}

// =============================================================================
// Trial (Judgment System)
// =============================================================================

/** Phase of the trial */
export type TrialPhase =
  | 'charges_read'
  | 'prosecution'
  | 'defense'
  | 'cross_examination'
  | 'verdict';

/** A charge brought against the player */
export interface TrialCharge {
  /** The canonical event that forms the basis of the charge */
  eventId: string;
  /** The action that was taken */
  action: string;
  /** Chronicle excerpt that frames this charge */
  chronicleExcerpt: string;
  /** Player's memory of the same event (may differ) */
  playerMemory?: string;
  /** Whether the player's memory conflicts with the chronicle */
  hasConflict: boolean;
}

/** NPC testimony for or against the player */
export interface TrialTestimony {
  /** NPC giving testimony */
  npcId: string;
  npcName: string;
  /** Whether this NPC testifies for prosecution or defense */
  side: 'prosecution' | 'defense';
  /** The testimony content */
  content: string;
  /** NPC's relationship to the player (influences credibility) */
  disposition: 'hostile' | 'neutral' | 'friendly';
  /** Trust level toward player (0-1) */
  trustLevel: number;
}

/** The 10 verdict archetypes */
export type VerdictArchetype =
  | 'the_hero'              // Genuine good, even when hard
  | 'the_well_meaning_fool' // Good intentions, bad outcomes
  | 'the_pragmatist'        // Did what was necessary
  | 'the_coward'            // Avoided hard choices
  | 'the_hypocrite'         // Preached values, violated them
  | 'the_monster'           // Consistently cruel
  | 'the_mystery'           // Contradictory, unreadable
  | 'the_growth'            // Started bad, became good
  | 'the_fall'              // Started good, became bad
  | 'the_mirror';           // Reflected whoever they faced

/** The final verdict of the trial */
export interface TrialVerdict {
  /** Primary archetype */
  archetype: VerdictArchetype;
  /** Confidence in this classification (0-1) */
  confidence: number;
  /** Runner-up archetype (if close) */
  secondaryArchetype?: VerdictArchetype;
  /** Narrative explanation of the verdict */
  narrative: string;
  /** Key evidence that led to this verdict */
  keyEvidence: string[];
}

/** Complete trial state */
export interface Trial {
  id: string;
  gameId: string;
  /** Current phase of the trial */
  phase: TrialPhase;
  /** Charges against the player */
  charges: TrialCharge[];
  /** Prosecution testimony */
  prosecutionTestimony: TrialTestimony[];
  /** Defense testimony */
  defenseTestimony: TrialTestimony[];
  /** The verdict (set in verdict phase) */
  verdict?: TrialVerdict;
  /** Turn when trial was initiated */
  turn: number;
  createdAt: string;
}
