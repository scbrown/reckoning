/**
 * @reckoning/shared
 *
 * Shared types and utilities used across client and server packages.
 */

export * from './tts/index.js';
export * from './common/index.js';

// Re-export game types (these are the canonical definitions)
export * from './game/index.js';

// Re-export SSE types, excluding duplicates that conflict with game/events.ts
// The game module has the authoritative definitions for these event types
export type {
  HeartbeatEvent,
  SSEEventType,
  SSEEventByType,
  SSEEvent,
} from './sse/index.js';
