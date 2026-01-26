/**
 * Seed Routes
 *
 * API endpoints for world seeding via Claude Code research sessions.
 * These endpoints are called by the reckoning-seed CLI tool.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EventEmitter } from 'events';
import {
  broadcastManager,
  setupSSEResponse,
} from '../services/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Event types for world seeding research progress
 */
export type SeedEventType =
  | 'research-started'
  | 'source-found'
  | 'adapting'
  | 'synthesizing';

/**
 * WorldSeed schema for structured world generation input
 */
export interface WorldSeed {
  $schema: 'worldseed-v1';
  sourceInspiration: string;
  setting: string;
  tone: {
    overall: 'dark' | 'light' | 'comedic' | 'dramatic' | 'horror' | 'adventure';
    description: string;
  };
  characters: Array<{
    name: string;
    role: 'player' | 'ally' | 'villain' | 'neutral';
    description: string;
    suggestedTraits: string[];
    visualDescription: string;
  }>;
  locations: Array<{
    name: string;
    description: string;
    mood: string;
    connectedTo: string[];
    visualDescription: string;
  }>;
  themes: string[];
  visualStyle: {
    era: string;
    aesthetic: string;
    colorPalette: string[];
    lightingMood: string;
  };
  contextSummary: string;
}

/**
 * A seed session tracks an active research session
 */
export interface SeedSession {
  id: string;
  gameId?: string;
  dmPrompt?: string;
  status: 'active' | 'completed' | 'failed';
  events: Array<{
    type: SeedEventType;
    data?: unknown;
    timestamp: string;
  }>;
  seed?: WorldSeed;
  createdAt: string;
  completedAt?: string;
}

// Request types
interface SubmitSeedRequest {
  sessionId: string;
  seed: WorldSeed;
}

interface SendEventRequest {
  sessionId: string;
  type: SeedEventType;
  data?: unknown;
}

interface StartSessionRequest {
  gameId?: string;
  dmPrompt?: string;
}

// =============================================================================
// Session Manager
// =============================================================================

/**
 * In-memory session manager for seed sessions
 * Sessions expire after 1 hour of inactivity
 */
class SeedSessionManager extends EventEmitter {
  private sessions = new Map<string, SeedSession>();
  private readonly SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor() {
    super();
    // Clean up expired sessions every 10 minutes
    setInterval(() => this.cleanupExpired(), 10 * 60 * 1000);
  }

  create(gameId?: string, dmPrompt?: string): SeedSession {
    const id = this.generateId();
    const session: SeedSession = {
      id,
      gameId,
      dmPrompt,
      status: 'active',
      events: [],
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(id, session);
    console.log(`[SeedSession] Created session ${id}`);
    return session;
  }

  get(id: string): SeedSession | undefined {
    return this.sessions.get(id);
  }

  addEvent(sessionId: string, type: SeedEventType, data?: unknown): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[SeedSession] Session not found: ${sessionId}`);
      return false;
    }

    if (session.status !== 'active') {
      console.warn(`[SeedSession] Session ${sessionId} is not active`);
      return false;
    }

    const event = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };

    session.events.push(event);
    console.log(`[SeedSession] Event ${type} added to session ${sessionId}`);

    // Emit for SSE subscribers
    this.emit('event', sessionId, event);

    return true;
  }

  submit(sessionId: string, seed: WorldSeed): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[SeedSession] Session not found: ${sessionId}`);
      return false;
    }

    if (session.status !== 'active') {
      console.warn(`[SeedSession] Session ${sessionId} is not active`);
      return false;
    }

    session.seed = seed;
    session.status = 'completed';
    session.completedAt = new Date().toISOString();

    console.log(`[SeedSession] WorldSeed submitted for session ${sessionId}`);

    // Emit for SSE subscribers
    this.emit('worldseed', sessionId, seed);
    this.emit('complete', sessionId);

    return true;
  }

  fail(sessionId: string, error: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.status = 'failed';
    session.completedAt = new Date().toISOString();

    // Emit for SSE subscribers
    this.emit('error', sessionId, error);

    return true;
  }

  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  private generateId(): string {
    return `seed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      const createdAt = new Date(session.createdAt).getTime();
      if (now - createdAt > this.SESSION_TTL_MS) {
        console.log(`[SeedSession] Cleaning up expired session ${id}`);
        this.sessions.delete(id);
      }
    }
  }
}

// Singleton session manager
const sessionManager = new SeedSessionManager();

// =============================================================================
// Request Validation Schemas
// =============================================================================

const startSessionSchema = {
  body: {
    type: 'object',
    properties: {
      gameId: { type: 'string' },
      dmPrompt: { type: 'string', maxLength: 10000 },
    },
  },
};

const submitSeedSchema = {
  body: {
    type: 'object',
    required: ['sessionId', 'seed'],
    properties: {
      sessionId: { type: 'string' },
      seed: {
        type: 'object',
        required: ['$schema', 'sourceInspiration', 'setting', 'tone', 'characters', 'locations', 'themes', 'visualStyle', 'contextSummary'],
        properties: {
          $schema: { type: 'string', const: 'worldseed-v1' },
          sourceInspiration: { type: 'string' },
          setting: { type: 'string' },
          tone: {
            type: 'object',
            required: ['overall', 'description'],
            properties: {
              overall: { type: 'string', enum: ['dark', 'light', 'comedic', 'dramatic', 'horror', 'adventure'] },
              description: { type: 'string' },
            },
          },
          characters: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'role', 'description', 'suggestedTraits', 'visualDescription'],
              properties: {
                name: { type: 'string' },
                role: { type: 'string', enum: ['player', 'ally', 'villain', 'neutral'] },
                description: { type: 'string' },
                suggestedTraits: { type: 'array', items: { type: 'string' } },
                visualDescription: { type: 'string' },
              },
            },
          },
          locations: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'description', 'mood', 'connectedTo', 'visualDescription'],
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                mood: { type: 'string' },
                connectedTo: { type: 'array', items: { type: 'string' } },
                visualDescription: { type: 'string' },
              },
            },
          },
          themes: { type: 'array', items: { type: 'string' } },
          visualStyle: {
            type: 'object',
            required: ['era', 'aesthetic', 'colorPalette', 'lightingMood'],
            properties: {
              era: { type: 'string' },
              aesthetic: { type: 'string' },
              colorPalette: { type: 'array', items: { type: 'string' } },
              lightingMood: { type: 'string' },
            },
          },
          contextSummary: { type: 'string' },
        },
      },
    },
  },
};

const sendEventSchema = {
  body: {
    type: 'object',
    required: ['sessionId', 'type'],
    properties: {
      sessionId: { type: 'string' },
      type: { type: 'string', enum: ['research-started', 'source-found', 'adapting', 'synthesizing'] },
      data: { type: 'object' },
    },
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string
) {
  return reply.status(statusCode).send({
    error: {
      code,
      message,
    },
  });
}

// =============================================================================
// Routes
// =============================================================================

export async function seedRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/seed/start
   * Start a new seed session
   */
  fastify.post<{ Body: StartSessionRequest }>(
    '/start',
    { schema: startSessionSchema },
    async (request: FastifyRequest<{ Body: StartSessionRequest }>, reply: FastifyReply) => {
      const { gameId, dmPrompt } = request.body;

      try {
        const session = sessionManager.create(gameId, dmPrompt);

        return reply.send({
          success: true,
          sessionId: session.id,
          message: 'Seed session started',
        });
      } catch (error) {
        request.log.error(error, 'Failed to start seed session');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to start seed session');
      }
    }
  );

  /**
   * GET /api/seed/:sessionId
   * Get session status
   */
  fastify.get<{ Params: { sessionId: string } }>(
    '/:sessionId',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const { sessionId } = request.params;

      const session = sessionManager.get(sessionId);
      if (!session) {
        return sendError(reply, 404, 'SESSION_NOT_FOUND', `Session not found: ${sessionId}`);
      }

      return reply.send({ session });
    }
  );

  /**
   * GET /api/seed/:sessionId/events (SSE)
   * Subscribe to session events
   */
  fastify.get<{ Params: { sessionId: string } }>(
    '/:sessionId/events',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const { sessionId } = request.params;

      const session = sessionManager.get(sessionId);
      if (!session) {
        return sendError(reply, 404, 'SESSION_NOT_FOUND', `Session not found: ${sessionId}`);
      }

      // Set up SSE
      setupSSEResponse(reply);

      // Send initial state with all existing events
      reply.raw.write(`data: ${JSON.stringify({
        type: 'init',
        session: {
          id: session.id,
          status: session.status,
          events: session.events,
        },
      })}\n\n`);

      // Subscribe to future events
      const onEvent = (sid: string, event: { type: SeedEventType; data?: unknown; timestamp: string }) => {
        if (sid === sessionId) {
          reply.raw.write(`data: ${JSON.stringify({ type: 'event', event })}\n\n`);
        }
      };

      const onWorldSeed = (sid: string, seed: WorldSeed) => {
        if (sid === sessionId) {
          reply.raw.write(`data: ${JSON.stringify({ type: 'worldseed', seed })}\n\n`);
        }
      };

      const onComplete = (sid: string) => {
        if (sid === sessionId) {
          reply.raw.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
          cleanup();
          reply.raw.end();
        }
      };

      const onError = (sid: string, error: string) => {
        if (sid === sessionId) {
          reply.raw.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`);
          cleanup();
          reply.raw.end();
        }
      };

      const cleanup = () => {
        sessionManager.off('event', onEvent);
        sessionManager.off('worldseed', onWorldSeed);
        sessionManager.off('complete', onComplete);
        sessionManager.off('error', onError);
      };

      sessionManager.on('event', onEvent);
      sessionManager.on('worldseed', onWorldSeed);
      sessionManager.on('complete', onComplete);
      sessionManager.on('error', onError);

      // Handle disconnect
      request.raw.on('close', cleanup);

      return reply;
    }
  );

  /**
   * POST /api/seed/submit
   * Submit a completed WorldSeed (called by reckoning-seed CLI)
   */
  fastify.post<{ Body: SubmitSeedRequest }>(
    '/submit',
    { schema: submitSeedSchema },
    async (request: FastifyRequest<{ Body: SubmitSeedRequest }>, reply: FastifyReply) => {
      const { sessionId, seed } = request.body;

      try {
        const success = sessionManager.submit(sessionId, seed);

        if (!success) {
          const session = sessionManager.get(sessionId);
          if (!session) {
            return sendError(reply, 404, 'SESSION_NOT_FOUND', `Session not found: ${sessionId}`);
          }
          return sendError(reply, 400, 'SESSION_NOT_ACTIVE', 'Session is not active');
        }

        // If session has a gameId, broadcast to game subscribers
        const session = sessionManager.get(sessionId);
        if (session?.gameId) {
          broadcastManager.broadcast(session.gameId, {
            type: 'worldseed_ready',
            seed,
          });
        }

        return reply.send({
          success: true,
          message: 'WorldSeed submitted successfully',
        });
      } catch (error) {
        request.log.error(error, 'Failed to submit WorldSeed');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to submit WorldSeed');
      }
    }
  );

  /**
   * POST /api/seed/event
   * Send a progress event (called by reckoning-seed CLI)
   */
  fastify.post<{ Body: SendEventRequest }>(
    '/event',
    { schema: sendEventSchema },
    async (request: FastifyRequest<{ Body: SendEventRequest }>, reply: FastifyReply) => {
      const { sessionId, type, data } = request.body;

      try {
        const success = sessionManager.addEvent(sessionId, type, data);

        if (!success) {
          const session = sessionManager.get(sessionId);
          if (!session) {
            return sendError(reply, 404, 'SESSION_NOT_FOUND', `Session not found: ${sessionId}`);
          }
          return sendError(reply, 400, 'SESSION_NOT_ACTIVE', 'Session is not active');
        }

        // If session has a gameId, broadcast to game subscribers
        const session = sessionManager.get(sessionId);
        if (session?.gameId) {
          broadcastManager.broadcast(session.gameId, {
            type: 'seed_progress',
            eventType: type,
            data,
          });
        }

        return reply.send({
          success: true,
          message: `Event '${type}' sent successfully`,
        });
      } catch (error) {
        request.log.error(error, 'Failed to send event');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to send event');
      }
    }
  );

  /**
   * DELETE /api/seed/:sessionId
   * Cancel/delete a session
   */
  fastify.delete<{ Params: { sessionId: string } }>(
    '/:sessionId',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const { sessionId } = request.params;

      const session = sessionManager.get(sessionId);
      if (!session) {
        return sendError(reply, 404, 'SESSION_NOT_FOUND', `Session not found: ${sessionId}`);
      }

      // Fail the session first to notify subscribers
      if (session.status === 'active') {
        sessionManager.fail(sessionId, 'Session cancelled');
      }

      sessionManager.delete(sessionId);

      return reply.send({
        success: true,
        message: 'Session deleted',
      });
    }
  );
}

// Export session manager for testing
export { sessionManager, SeedSessionManager };
