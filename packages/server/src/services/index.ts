/**
 * Server Services
 *
 * Re-exports all service modules for convenient importing.
 */

export {
  voiceRegistry,
  getAvailableVoices,
  findVoiceById,
} from './voice-registry.js';

export {
  BroadcastManager,
  broadcastManager,
  setupSSEResponse,
  formatSSEMessage,
} from './sse/index.js';

export type {
  SSEClient,
  SSEEvent,
  SubscribeOptions,
  BroadcastManagerOptions,
  BroadcastStats,
} from './sse/index.js';
