/**
 * Beat Types
 *
 * Types for structured AI narrative output. Beats are atomic units of narrative
 * that the AI generates and the DM can edit before they become canonical events.
 *
 * Beats enable:
 * - Individual editing of narrative elements
 * - Sequential TTS playback with voice hints
 * - Rearrangement and modification before canonization
 */

// =============================================================================
// Beat Types
// =============================================================================

/**
 * Types of narrative beats the AI can generate
 */
export type BeatType =
  | 'narration' // Scene description, atmospheric text
  | 'dialogue' // Character speech (player, party member, NPC)
  | 'action' // Physical actions happening in the scene
  | 'thought' // Internal character thoughts or feelings
  | 'sound' // Sound effects or ambient audio cues
  | 'transition'; // Scene transitions or time passage

// =============================================================================
// Narrative Beat
// =============================================================================

/**
 * A single atomic unit of narrative output from the AI
 */
export interface NarrativeBeat {
  /** Unique identifier for this beat */
  id: string;
  /** What kind of narrative element this is */
  type: BeatType;
  /** The narrative content of this beat */
  content: string;
  /** Who is speaking/acting (for dialogue, action, thought beats) */
  speaker?: string;
  /** Optional metadata for TTS and display */
  metadata?: BeatMetadata;
}

/**
 * Optional metadata for TTS rendering and display
 */
export interface BeatMetadata {
  /** Emotional tone for TTS voice modulation */
  emotion?: string;
  /** Volume hint for TTS */
  volume?: 'whisper' | 'normal' | 'loud';
  /** Pacing hint for TTS */
  pace?: 'slow' | 'normal' | 'fast';
  /** Pause duration after this beat (in milliseconds) */
  pauseAfter?: number;
}

// =============================================================================
// Beat Sequence
// =============================================================================

/**
 * Status of a beat sequence in the DM editing workflow
 */
export type BeatSequenceStatus =
  | 'pending' // Waiting for DM review
  | 'reviewing' // DM is actively editing
  | 'approved' // Ready to become canonical events
  | 'rejected'; // DM rejected, needs regeneration

/**
 * A sequence of beats representing a complete AI generation response
 */
export interface BeatSequence {
  /** Unique identifier for this sequence */
  id: string;
  /** The ordered list of narrative beats */
  beats: NarrativeBeat[];
  /** ID of the game this sequence belongs to */
  gameId: string;
  /** Turn number when this was generated */
  turn: number;
  /** ISO timestamp of when this sequence was generated */
  generatedAt: string;
  /** Current status in the DM workflow */
  status: BeatSequenceStatus;
}
