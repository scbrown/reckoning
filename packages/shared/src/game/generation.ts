/**
 * Generation Types
 *
 * Types for AI content generation and context building.
 */

import type { EventType } from './events.js';
import type { GameState } from './types.js';

// =============================================================================
// Generation Context
// =============================================================================

/**
 * Type of content being generated
 */
export type GenerationType =
  | 'narration'
  | 'npc_response'
  | 'environment_reaction'
  | 'dm_continuation';

/**
 * Context provided to the AI for content generation
 */
export interface GenerationContext {
  /** What type of content to generate */
  type: GenerationType;
  /** Current game state */
  gameState: GameState;
  /** Recent event history for context */
  recentHistory: string[];
  /** Summarized historical context (for longer games) */
  historyContext?: string;
  /** Formatted party status with health (e.g., "Party: Theron (Fighter) [Healthy]") */
  formattedPartyContext?: string;
  /** Optional DM guidance or constraints */
  dmGuidance?: string;
}

// =============================================================================
// Generated Content
// =============================================================================

/**
 * Content produced by the AI generation system
 */
export interface GeneratedContent {
  /** Unique identifier for this generation */
  id: string;
  /** What type of generation produced this */
  generationType: GenerationType;
  /** The event type this will become */
  eventType: EventType;
  /** The generated narrative content */
  content: string;
  /** Additional metadata about the generation */
  metadata: GenerationMetadata;
}

/**
 * Metadata about generated content
 */
export interface GenerationMetadata {
  /** Who is speaking (for dialogue) */
  speaker?: string;
  /** Suggested follow-up actions for the player */
  suggestedActions?: string[];
}

// =============================================================================
// Generator Interface
// =============================================================================

/**
 * Interface for content generation implementations
 */
export interface ContentGenerator {
  /**
   * Generate new content based on context
   * @param context - The generation context
   * @returns The generated content
   */
  generate(context: GenerationContext): Promise<GeneratedContent>;

  /**
   * Regenerate content with optional additional guidance
   * @param context - The generation context
   * @param guidance - Optional additional guidance for regeneration
   * @returns The newly generated content
   */
  regenerate(
    context: GenerationContext,
    guidance?: string
  ): Promise<GeneratedContent>;
}

// =============================================================================
// Context Builder Interface
// =============================================================================

/**
 * Interface for building generation context from game state
 */
export interface ContextBuilder {
  /**
   * Build a generation context from the current game state
   * @param gameState - Current game state
   * @param type - Type of content to generate
   * @returns The built context
   */
  build(gameState: GameState, type: GenerationType): Promise<GenerationContext>;

  /**
   * Summarize history for long-running games
   * @param events - Events to summarize
   * @returns Summarized history text
   */
  summarizeHistory?(events: string[]): Promise<string>;
}
