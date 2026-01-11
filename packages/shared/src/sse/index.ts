/**
 * SSE (Server-Sent Events) Types
 *
 * Shared interfaces for real-time event streaming between server and client.
 */

// =============================================================================
// Base Event Interface
// =============================================================================

interface BaseSSEEvent {
  /** Timestamp when the event was created */
  timestamp: string;
}

// =============================================================================
// Generation Events
// =============================================================================

export interface GenerationStartedEvent extends BaseSSEEvent {
  type: 'generation_started';
  /** Unique ID for this generation request */
  generationId: string;
}

export interface GenerationCompleteEvent extends BaseSSEEvent {
  type: 'generation_complete';
  /** Unique ID for this generation request */
  generationId: string;
  /** Generated content */
  content: string;
  /** Event type classification */
  eventType: string;
  /** Additional metadata (speaker, suggested actions, etc.) */
  metadata?: {
    speaker?: string;
    suggestedActions?: string[];
  };
}

export interface GenerationErrorEvent extends BaseSSEEvent {
  type: 'generation_error';
  /** Unique ID for this generation request */
  generationId: string;
  /** Error message */
  error: string;
  /** Whether the error is retryable */
  retryable: boolean;
}

// =============================================================================
// State Events
// =============================================================================

export interface StateChangedEvent extends BaseSSEEvent {
  type: 'state_changed';
  /** Previous state */
  previousState: string;
  /** New state */
  newState: string;
}

// =============================================================================
// TTS Events
// =============================================================================

export interface TTSStartedEvent extends BaseSSEEvent {
  type: 'tts_started';
  /** TTS request ID */
  requestId: string;
}

export interface TTSCompleteEvent extends BaseSSEEvent {
  type: 'tts_complete';
  /** TTS request ID */
  requestId: string;
  /** Duration in milliseconds */
  durationMs?: number;
}

// =============================================================================
// Editor Events
// =============================================================================

export interface EditorStateEvent extends BaseSSEEvent {
  type: 'editor_state';
  /** Current editor content */
  content: string;
  /** Cursor position */
  cursorPosition?: number;
  /** Selection range */
  selection?: { start: number; end: number };
}

// =============================================================================
// Party Events
// =============================================================================

export interface PartyChangedEvent extends BaseSSEEvent {
  type: 'party_changed';
  /** The updated party */
  party: import('../game/types.js').Party;
}

// =============================================================================
// System Events
// =============================================================================

export interface HeartbeatEvent extends BaseSSEEvent {
  type: 'heartbeat';
}

// =============================================================================
// Union Type
// =============================================================================

/**
 * All possible SSE event types
 */
export type SSEEvent =
  | GenerationStartedEvent
  | GenerationCompleteEvent
  | GenerationErrorEvent
  | StateChangedEvent
  | TTSStartedEvent
  | TTSCompleteEvent
  | EditorStateEvent
  | PartyChangedEvent
  | HeartbeatEvent;

/**
 * Extract event type string from SSEEvent union
 */
export type SSEEventType = SSEEvent['type'];

/**
 * Get specific event type by its type field
 */
export type SSEEventByType<T extends SSEEventType> = Extract<
  SSEEvent,
  { type: T }
>;
