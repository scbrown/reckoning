/**
 * Memory Journal Types (Unreliable Self — Pillar 1)
 *
 * Types for character-biased memory entries that differ from
 * canonical event truth. The character's journal reflects their
 * psychology, not objective reality.
 */

/** Types of memory distortion a character can apply */
export type DistortionType =
  | 'self_aggrandizing'   // "I was brave" — reality: you hesitated
  | 'guilt_suppression'   // "They attacked first" — reality: you did
  | 'trauma_blocking'     // "I don't remember" — reality: you do
  | 'hero_framing'        // "I saved them" — reality: they saved themselves
  | 'villain_projecting'  // "They betrayed me" — reality: you betrayed them
  | 'false_competence'    // "I solved it" — reality: luck or others
  | 'faithful';           // No distortion — accurate memory

/** A single memory journal entry */
export interface MemoryEntry {
  id: string;
  gameId: string;
  characterId: string;
  sourceEventId: string;
  turn: number;
  /** The biased journal entry (character's perspective) */
  content: string;
  /** What distortion was applied */
  distortionType: DistortionType;
  /** How strongly distorted (0 = faithful, 1 = heavily distorted) */
  distortionStrength: number;
  /** Which traits influenced the distortion */
  influencingTraits?: string[];
  /** DM can replace the biased text */
  dmOverride?: string;
  /** Whether the DM has reviewed this entry */
  dmApproved: boolean;
  createdAt: string;
}

/** Input for creating a new memory entry */
export interface CreateMemoryInput {
  gameId: string;
  characterId: string;
  sourceEventId: string;
  turn: number;
  content: string;
  distortionType: DistortionType;
  distortionStrength: number;
  influencingTraits?: string[];
}
