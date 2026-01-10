/**
 * SSE Broadcast Manager
 *
 * Manages SSE client connections and broadcasts events to subscribed clients.
 */

import type { FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import type {
  SSEClient,
  SSEEvent,
  SubscribeOptions,
  BroadcastManagerOptions,
  BroadcastStats,
} from './types.js';

// =============================================================================
// SSE Helpers
// =============================================================================

/**
 * Set up SSE response headers on a Fastify reply
 */
export function setupSSEResponse(reply: FastifyReply): void {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
}

/**
 * Format an SSE event as a string
 */
export function formatSSEMessage(event: SSEEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

// =============================================================================
// BroadcastManager Class
// =============================================================================

/**
 * Manages SSE client connections and event broadcasting
 */
export class BroadcastManager {
  /** Map of gameId -> Set of connected clients */
  private clients: Map<string, Set<SSEClient>> = new Map();

  /** Map of clientId -> SSEClient for quick lookup */
  private clientsById: Map<string, SSEClient> = new Map();

  /** Heartbeat timer */
  private heartbeatInterval: NodeJS.Timeout | null = null;

  /** Heartbeat interval in milliseconds */
  private heartbeatIntervalMs: number;

  constructor(options: BroadcastManagerOptions = {}) {
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30000;
  }

  /**
   * Subscribe a client to game events
   * @returns The client ID for later reference
   */
  subscribe(options: SubscribeOptions): string;
  subscribe(gameId: string, response: FastifyReply): string;
  subscribe(
    gameIdOrOptions: string | SubscribeOptions,
    maybeResponse?: FastifyReply
  ): string {
    const gameId =
      typeof gameIdOrOptions === 'string'
        ? gameIdOrOptions
        : gameIdOrOptions.gameId;
    const response =
      typeof gameIdOrOptions === 'string'
        ? maybeResponse!
        : gameIdOrOptions.response;

    const clientId = randomUUID();
    const client: SSEClient = {
      id: clientId,
      gameId,
      response,
      connectedAt: new Date(),
    };

    // Set up SSE headers
    setupSSEResponse(response);

    // Add client to game set
    if (!this.clients.has(gameId)) {
      this.clients.set(gameId, new Set());
    }
    this.clients.get(gameId)!.add(client);
    this.clientsById.set(clientId, client);

    // Set up cleanup on close
    response.raw.on('close', () => {
      this.unsubscribe(gameId, clientId);
    });

    return clientId;
  }

  /**
   * Unsubscribe a client
   */
  unsubscribe(gameId: string, clientId: string): void {
    const client = this.clientsById.get(clientId);
    if (!client) return;

    const gameClients = this.clients.get(gameId);
    if (gameClients) {
      gameClients.delete(client);
      if (gameClients.size === 0) {
        this.clients.delete(gameId);
      }
    }

    this.clientsById.delete(clientId);
  }

  /**
   * Broadcast an event to all clients subscribed to a game
   */
  broadcast(gameId: string, event: SSEEvent): void {
    const gameClients = this.clients.get(gameId);
    if (!gameClients || gameClients.size === 0) return;

    const message = formatSSEMessage(event);

    for (const client of gameClients) {
      this.writeToClient(client, message);
    }
  }

  /**
   * Send an event to a specific client
   */
  send(clientId: string, event: SSEEvent): void {
    const client = this.clientsById.get(clientId);
    if (!client) return;

    const message = formatSSEMessage(event);
    this.writeToClient(client, message);
  }

  /**
   * Get the number of connected clients for a game
   */
  getClientCount(gameId: string): number {
    return this.clients.get(gameId)?.size ?? 0;
  }

  /**
   * Start the heartbeat timer
   */
  startHeartbeat(intervalMs?: number): void {
    if (this.heartbeatInterval) {
      this.stopHeartbeat();
    }

    const interval = intervalMs ?? this.heartbeatIntervalMs;
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeats();
    }, interval);
  }

  /**
   * Stop the heartbeat timer
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Clean up all connections for a game
   */
  cleanup(gameId: string): void {
    const gameClients = this.clients.get(gameId);
    if (!gameClients) return;

    for (const client of gameClients) {
      this.clientsById.delete(client.id);
      // End the response if still writable
      if (client.response.raw.writable) {
        client.response.raw.end();
      }
    }

    this.clients.delete(gameId);
  }

  /**
   * Clean up all connections (for server shutdown)
   */
  cleanupAll(): void {
    this.stopHeartbeat();

    for (const gameId of this.clients.keys()) {
      this.cleanup(gameId);
    }
  }

  /**
   * Get broadcast statistics
   */
  getStats(): BroadcastStats {
    let totalClients = 0;
    const clientsByGame = new Map<string, number>();

    for (const [gameId, clients] of this.clients.entries()) {
      const count = clients.size;
      totalClients += count;
      clientsByGame.set(gameId, count);
    }

    return {
      totalClients,
      activeGames: this.clients.size,
      clientsByGame,
    };
  }

  /**
   * Write a message to a client, handling errors
   */
  private writeToClient(client: SSEClient, message: string): void {
    try {
      if (client.response.raw.writable) {
        client.response.raw.write(message);
      } else {
        // Connection is dead, clean it up
        this.unsubscribe(client.gameId, client.id);
      }
    } catch {
      // Connection error, clean it up
      this.unsubscribe(client.gameId, client.id);
    }
  }

  /**
   * Send heartbeat to all connected clients
   */
  private sendHeartbeats(): void {
    const heartbeat: SSEEvent = {
      type: 'heartbeat',
      timestamp: new Date().toISOString(),
    };
    const message = formatSSEMessage(heartbeat);

    for (const [gameId, gameClients] of this.clients.entries()) {
      for (const client of gameClients) {
        try {
          if (client.response.raw.writable) {
            client.response.raw.write(message);
          } else {
            // Dead connection, schedule cleanup
            this.unsubscribe(gameId, client.id);
          }
        } catch {
          // Error writing, clean up
          this.unsubscribe(gameId, client.id);
        }
      }
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

/**
 * Singleton instance of BroadcastManager
 */
export const broadcastManager = new BroadcastManager();
