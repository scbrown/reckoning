/**
 * Event Types
 *
 * Types for canonical game events and server-sent events (SSE).
 */

import type { DMEditorState } from './dm.js';

// =============================================================================
// Canonical Events
// =============================================================================

/**
 * Types of events that can occur in the game
 */
export type EventType =
  | 'narration'
  | 'party_action'
  | 'party_dialogue'
  | 'npc_action'
  | 'npc_dialogue'
  | 'environment'
  | 'dm_injection';

/**
 * A canonical event recorded in the game history
 *
 * Canonical events represent objective facts about what happened.
 * Interpretations and perspectives are layered on top separately.
 */
export interface CanonicalEvent {
  /** Unique identifier for this event */
  id: string;
  /** ID of the game this event belongs to */
  gameId: string;
  /** Turn number when this event occurred */
  turn: number;
  /** ISO timestamp of when the event occurred */
  timestamp: string;
  /** Category of the event */
  eventType: EventType;
  /** The narrative content of the event */
  content: string;
  /** Original AI-generated content (if edited) */
  originalGenerated?: string;
  /** Who spoke (for dialogue events) */
  speaker?: string;
  /** ID of the area where this event occurred */
  locationId: string;
  /** IDs of characters/NPCs who witnessed this event */
  witnesses: string[];
}

// =============================================================================
// Server-Sent Events
// =============================================================================

/**
 * SSE event indicating generation has started
 */
export interface GenerationStartedEvent {
  type: 'generation_started';
  /** What kind of content is being generated */
  generationType: string;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * SSE event indicating generation completed successfully
 */
export interface GenerationCompleteEvent {
  type: 'generation_complete';
  /** The generated content */
  content: string;
  /** Generation metadata */
  metadata: {
    /** Time taken in milliseconds */
    durationMs: number;
    /** Tokens used (if available) */
    tokensUsed?: number;
  };
  /** ISO timestamp */
  timestamp: string;
}

/**
 * SSE event indicating generation failed
 */
export interface GenerationErrorEvent {
  type: 'generation_error';
  /** Error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Whether the operation can be retried */
  retryable: boolean;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * SSE event indicating game state changed
 */
export interface StateChangedEvent {
  type: 'state_changed';
  /** What aspect of state changed */
  changeType: 'turn' | 'location' | 'party' | 'event_added';
  /** The new state (partial) */
  payload: Record<string, unknown>;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * SSE event indicating TTS generation started
 */
export interface TTSStartedEvent {
  type: 'tts_started';
  /** ID of the event being spoken */
  eventId: string;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * SSE event indicating TTS generation completed
 */
export interface TTSCompleteEvent {
  type: 'tts_complete';
  /** ID of the event that was spoken */
  eventId: string;
  /** Duration of audio in milliseconds */
  durationMs: number;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * SSE event with updated DM editor state
 */
export interface EditorStateEvent {
  type: 'editor_state';
  /** Current state of the DM editor */
  state: DMEditorState;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * Union type of all possible SSE events
 */
export type SSEEvent =
  | GenerationStartedEvent
  | GenerationCompleteEvent
  | GenerationErrorEvent
  | StateChangedEvent
  | TTSStartedEvent
  | TTSCompleteEvent
  | EditorStateEvent;
