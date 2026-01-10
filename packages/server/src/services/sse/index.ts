/**
 * SSE (Server-Sent Events) Service
 *
 * Provides real-time event broadcasting to connected clients.
 */

export {
  BroadcastManager,
  broadcastManager,
  setupSSEResponse,
  formatSSEMessage,
} from './broadcast-manager.js';

export type {
  SSEClient,
  SSEEvent,
  SubscribeOptions,
  BroadcastManagerOptions,
  BroadcastStats,
  GeneratedContent,
  DMEditorState,
  GameState,
} from './types.js';
