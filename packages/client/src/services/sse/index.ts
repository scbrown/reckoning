/**
 * SSE Service - Client-side Server-Sent Events handler
 *
 * Manages SSE connections to the server for real-time updates.
 */

import type { SSEEvent, SSEEventType } from '@reckoning/shared';
import type {
  SSEEventHandler,
  SSEConnectionState,
  SSEServiceConfig,
} from './types.js';
import { DEFAULT_SSE_CONFIG } from './types.js';

export type { SSEEventHandler, SSEConnectionState, SSEServiceConfig };
export { DEFAULT_SSE_CONFIG };

/**
 * SSE Service for receiving real-time server updates
 */
export class SSEService {
  private eventSource: EventSource | null = null;
  private handlers: Map<string, Set<Function>> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private config: Required<SSEServiceConfig>;
  private gameId: string | null = null;
  private connectionState: SSEConnectionState = 'disconnected';

  constructor(config?: SSEServiceConfig) {
    this.config = {
      ...DEFAULT_SSE_CONFIG,
      ...config,
    };
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Connect to a game's SSE event stream
   * @param gameId - The game ID to connect to
   */
  connect(gameId: string): void {
    if (this.eventSource) {
      this.disconnect();
    }

    this.gameId = gameId;
    this.setConnectionState('connecting');

    this.eventSource = new EventSource(`/api/game/${gameId}/events`);

    this.eventSource.onopen = () => {
      console.log('[SSE] Connected');
      this.reconnectAttempts = 0;
      this.setConnectionState('connected');
    };

    this.eventSource.onerror = (error) => {
      console.error('[SSE] Error:', error);
      this.handleReconnect();
    };

    // Register handlers for each event type
    const eventTypes: SSEEventType[] = [
      'generation_started',
      'generation_complete',
      'generation_error',
      'state_changed',
      'party_changed',
      'tts_started',
      'tts_complete',
      'editor_state',
      'heartbeat',
    ];

    eventTypes.forEach((type) => {
      this.eventSource!.addEventListener(type, (e: Event) => {
        const messageEvent = e as MessageEvent;
        try {
          const data = JSON.parse(messageEvent.data);
          this.emit(type, data);
        } catch (error) {
          console.error(`[SSE] Failed to parse event data for ${type}:`, error);
        }
      });
    });
  }

  /**
   * Disconnect from the SSE stream and cleanup
   */
  disconnect(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.gameId = null;
    this.reconnectAttempts = 0;
    this.setConnectionState('disconnected');
    console.log('[SSE] Disconnected');
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  /**
   * Get the current game ID
   */
  getGameId(): string | null {
    return this.gameId;
  }

  /**
   * Get the current connection state
   */
  getConnectionState(): SSEConnectionState {
    return this.connectionState;
  }

  // ===========================================================================
  // Event Handler Registration
  // ===========================================================================

  /**
   * Register an event handler for a specific event type
   * @param eventType - The event type to listen for
   * @param handler - The handler function
   * @returns Unsubscribe function
   */
  on<T extends SSEEventType>(
    eventType: T,
    handler: SSEEventHandler<T>
  ): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }

    this.handlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.off(eventType, handler);
    };
  }

  /**
   * Remove a specific event handler
   * @param eventType - The event type
   * @param handler - The handler to remove
   */
  off<T extends SSEEventType>(
    eventType: T,
    handler: SSEEventHandler<T>
  ): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(eventType);
      }
    }
  }

  /**
   * Remove all handlers for a specific event type, or all handlers if no type specified
   * @param eventType - Optional event type to clear handlers for
   */
  offAll(eventType?: SSEEventType): void {
    if (eventType) {
      this.handlers.delete(eventType);
    } else {
      this.handlers.clear();
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Handle reconnection with exponential backoff
   */
  private handleReconnect(): void {
    if (!this.gameId) return;

    // Close the current connection
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.setConnectionState('reconnecting');

    const delay = Math.min(
      this.config.reconnectDelay *
        Math.pow(this.config.reconnectBackoff, this.reconnectAttempts),
      this.config.maxReconnectDelay
    );

    this.reconnectAttempts++;
    console.log(
      `[SSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimeoutId = setTimeout(() => {
      if (this.gameId) {
        this.connect(this.gameId);
      }
    }, delay);
  }

  /**
   * Emit an event to all registered handlers
   */
  private emit(type: string, data: SSEEvent): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[SSE] Handler error for ${type}:`, error);
        }
      });
    }
  }

  /**
   * Update the connection state
   */
  private setConnectionState(state: SSEConnectionState): void {
    this.connectionState = state;
  }
}

export default SSEService;
