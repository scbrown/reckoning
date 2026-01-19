/**
 * SSE (Server-Sent Events) Types
 *
 * Types for the SSE broadcast service. Internal types for connection
 * and broadcast management.
 */

import type { FastifyReply } from 'fastify';

// =============================================================================
// SSE Event Types (local until shared/game types available)
// TODO: Import from @reckoning/shared once A1: Shared Game Types is complete
// =============================================================================

/**
 * Generated content sent via SSE
 */
export interface GeneratedContent {
  id: string;
  generationType: string;
  eventType: string;
  content: string;
  metadata?: {
    speaker?: string;
    suggestedActions?: string[];
  };
}

/**
 * DM Editor state for live editing
 */
export interface DMEditorState {
  pending: boolean;
  editedContent: string | null;
  status: 'idle' | 'editing' | 'regenerating';
}

/**
 * Game state summary (minimal for SSE)
 */
export interface GameState {
  id: string;
  playerId: string;
  currentAreaId: string;
  turn: number;
}

/**
 * Emergence opportunity data for SSE
 */
export interface EmergenceOpportunitySSE {
  type: 'villain' | 'ally';
  entity: {
    type: string;
    id: string;
  };
  confidence: number;
  reason: string;
  triggeringEventId: string;
  contributingFactors: Array<{
    dimension: string;
    value: number;
    threshold: number;
  }>;
}

/**
 * Scene data for SSE events
 */
export interface SceneSSE {
  id: string;
  name: string | null;
  sceneType: string | null;
  status: 'active' | 'completed' | 'abandoned';
  startedTurn: number;
  completedTurn: number | null;
}

/**
 * Scene boundary suggestion from AI
 */
export interface SceneBoundarySuggestion {
  /** Confidence score from 0-1 that a scene boundary is appropriate */
  confidence: number;
  /** Reason for the suggestion */
  reason: string;
  /** Suggested scene type for the next scene */
  suggestedNextSceneType?: string;
}

/**
 * SSE Event discriminated union
 */
export type SSEEvent =
  | { type: 'generation_started'; contentType: string }
  | {
      type: 'generation_complete';
      generationId: string;
      content: string;
      eventType: string;
      metadata?: { speaker?: string; suggestedActions?: string[] };
      sceneBoundarySuggestion?: SceneBoundarySuggestion;
    }
  | { type: 'generation_error'; error: string }
  | { type: 'state_changed'; state: GameState }
  | { type: 'tts_started'; eventId: string }
  | { type: 'tts_complete'; eventId: string }
  | { type: 'editor_state'; editorState: DMEditorState }
  | { type: 'heartbeat'; timestamp: string }
  | { type: 'emergence_detected'; timestamp: string; opportunity: EmergenceOpportunitySSE; notificationId: string }
  | { type: 'scene_started'; scene: SceneSSE; gameId: string }
  | { type: 'scene_completed'; scene: SceneSSE; gameId: string }
  | { type: 'scene_abandoned'; scene: SceneSSE; gameId: string };

// =============================================================================
// SSE Client Types
// =============================================================================

/**
 * Represents a connected SSE client
 */
export interface SSEClient {
  /** Unique client identifier */
  id: string;
  /** Game the client is subscribed to */
  gameId: string;
  /** Fastify reply object for sending events */
  response: FastifyReply;
  /** When the client connected */
  connectedAt: Date;
}

// =============================================================================
// Broadcast Manager Types
// =============================================================================

/**
 * Options for subscribing a client
 */
export interface SubscribeOptions {
  /** Game ID to subscribe to */
  gameId: string;
  /** Fastify reply object */
  response: FastifyReply;
}

/**
 * Options for BroadcastManager configuration
 */
export interface BroadcastManagerOptions {
  /** Heartbeat interval in milliseconds (default: 30000) */
  heartbeatIntervalMs?: number;
}

/**
 * Stats about the broadcast manager
 */
export interface BroadcastStats {
  /** Total connected clients */
  totalClients: number;
  /** Number of active games with subscribers */
  activeGames: number;
  /** Client counts by game */
  clientsByGame: Map<string, number>;
}
