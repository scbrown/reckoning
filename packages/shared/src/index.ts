/**
 * @reckoning/shared
 *
 * Shared types and utilities used across client and server packages.
 */

export * from './tts/index.js';
export * from './common/index.js';

// Re-export game types (these are the canonical definitions)
export * from './game/index.js';

// Re-export SSE types from sse module (authoritative definitions)
export type {
  HeartbeatEvent,
  PartyChangedEvent,
  SSEEvent,
  SSEEventType,
  SSEEventByType,
  SSEEvent,
} from './sse/index.js';
