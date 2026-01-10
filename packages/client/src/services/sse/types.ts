/**
 * Client-side SSE Types
 *
 * Types for the SSE client service event handling.
 */

import type { SSEEvent, SSEEventType } from '@reckoning/shared';

/**
 * Type-safe event handler for a specific SSE event type
 */
export type SSEEventHandler<T extends SSEEventType> = (
  event: Extract<SSEEvent, { type: T }>
) => void;

/**
 * Connection states for the SSE service
 */
export type SSEConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

/**
 * Configuration options for SSEService
 */
export interface SSEServiceConfig {
  /** Delay before first reconnect attempt (default: 1000ms) */
  reconnectDelay?: number;
  /** Maximum delay between reconnect attempts (default: 30000ms) */
  maxReconnectDelay?: number;
  /** Backoff multiplier for reconnect delay (default: 1.5) */
  reconnectBackoff?: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_SSE_CONFIG: Required<SSEServiceConfig> = {
  reconnectDelay: 1000,
  maxReconnectDelay: 30000,
  reconnectBackoff: 1.5,
};
