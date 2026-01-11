/**
 * Game Routes
 *
 * API endpoints for game management, state control, and real-time events.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type {
  DMEditorState,
  DMAction,
  PlaybackMode,
  EventType,
  SystemStatus,
  GameObservation,
  GenerationType,
} from '@reckoning/shared';
import { getDatabase } from '../db/index.js';
import {
  GameRepository,
  SaveRepository,
  EventRepository,
  PartyRepository,
} from '../db/repositories/index.js';
import {
  broadcastManager,
  setupSSEResponse,
  ClaudeCodeCLI,
} from '../services/index.js';
import { createGameEngine, type GameEngine } from '../services/game-engine/index.js';

// =============================================================================
// Types
// =============================================================================

interface NewGameRequest {
  playerName: string;
  playerDescription?: string;
}

interface SaveGameRequest {
  name: string;
}

interface LoadGameRequest {
  slotId: string;
}

interface EditorUpdateRequest {
  editedContent?: string;
  status?: DMEditorState['status'];
}

interface SubmitRequest {
  action: DMAction;
}

interface RegenerateRequest {
  feedback?: string;
}

interface InjectRequest {
  content: string;
  eventType: EventType;
  speaker?: string;
}

interface NextRequest {
  type?: GenerationType;
  dmGuidance?: string;
}

interface ControlRequest {
  mode: PlaybackMode;
}

// =============================================================================
// Service Instances (lazily initialized)
// =============================================================================

let gameEngine: GameEngine | null = null;

function getGameEngine(): GameEngine {
  if (!gameEngine) {
    const db = getDatabase();
    const aiProvider = new ClaudeCodeCLI();
    gameEngine = createGameEngine({
      db,
      aiProvider,
      broadcaster: broadcastManager,
    });
  }
  return gameEngine;
}

// =============================================================================
// Request Validation Schemas
// =============================================================================

const newGameSchema = {
  body: {
    type: 'object',
    required: ['playerName'],
    properties: {
      playerName: { type: 'string', minLength: 1, maxLength: 50 },
      playerDescription: { type: 'string', maxLength: 500 },
    },
  },
};

const saveGameSchema = {
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
    },
  },
};

const loadGameSchema = {
  body: {
    type: 'object',
    required: ['slotId'],
    properties: {
      slotId: { type: 'string', format: 'uuid' },
    },
  },
};

const editorUpdateSchema = {
  body: {
    type: 'object',
    properties: {
      editedContent: { type: 'string' },
      status: { type: 'string', enum: ['idle', 'generating', 'editing', 'accepting'] },
    },
  },
};

const submitSchema = {
  body: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['ACCEPT', 'EDIT', 'REGENERATE', 'INJECT'] },
          content: { type: 'string' },
          guidance: { type: 'string' },
          eventType: { type: 'string' },
        },
      },
    },
  },
};

const regenerateSchema = {
  body: {
    type: 'object',
    properties: {
      feedback: { type: 'string', maxLength: 1000 },
    },
  },
};

const injectSchema = {
  body: {
    type: 'object',
    required: ['content', 'eventType'],
    properties: {
      content: { type: 'string', minLength: 1 },
      eventType: {
        type: 'string',
        enum: ['narration', 'party_action', 'party_dialogue', 'npc_action', 'npc_dialogue', 'environment', 'dm_injection'],
      },
      speaker: { type: 'string' },
    },
  },
};

const nextSchema = {
  body: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['narration', 'npc_response', 'environment_reaction', 'dm_continuation'],
      },
      dmGuidance: { type: 'string', maxLength: 1000 },
    },
  },
};

const controlSchema = {
  body: {
    type: 'object',
    required: ['mode'],
    properties: {
      mode: { type: 'string', enum: ['auto', 'paused', 'stepping', 'stopped'] },
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
  message: string,
  retryable = false
) {
  return reply.status(statusCode).send({
    error: {
      code,
      message,
      retryable,
    },
  });
}

// =============================================================================
// Routes
// =============================================================================

export async function gameRoutes(fastify: FastifyInstance) {
  const db = getDatabase();
  const gameRepo = new GameRepository(db);
  const saveRepo = new SaveRepository(db);
  const eventRepo = new EventRepository(db);
  const partyRepo = new PartyRepository(db);

  /**
   * POST /api/game/new
   * Create a new game session
   */
  fastify.post<{ Body: NewGameRequest }>(
    '/new',
    { schema: newGameSchema },
    async (request: FastifyRequest<{ Body: NewGameRequest }>, reply: FastifyReply) => {
      const { playerName, playerDescription } = request.body;

      try {
        const engine = getGameEngine();
        const gameState = await engine.startGame(playerName, playerDescription);

        // Get the full session
        const session = gameRepo.getSession(gameState.id);
        if (!session) {
          return sendError(reply, 500, 'GAME_CREATION_FAILED', 'Failed to create game session');
        }

        // Generate initial scene
        await engine.generateNext(gameState.id, { type: 'narration' });

        return reply.send({
          gameId: gameState.id,
          session,
        });
      } catch (error) {
        request.log.error(error, 'Failed to create new game');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to create game');
      }
    }
  );

  /**
   * GET /api/game/list
   * List saved games
   */
  fastify.get('/list', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const saves = saveRepo.list();
      return reply.send({ saves });
    } catch (error) {
      fastify.log.error(error, 'Failed to list saves');
      return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to list saved games');
    }
  });

  /**
   * GET /api/game/:id
   * Get current game state
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      try {
        const session = gameRepo.getSession(id);
        if (!session) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${id}`);
        }

        const engine = getGameEngine();
        const editorState = engine.getEditorState(id);

        return reply.send({
          session,
          editorState,
        });
      } catch (error) {
        request.log.error(error, 'Failed to get game');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to get game state');
      }
    }
  );

  /**
   * POST /api/game/:id/save
   * Save game to slot
   */
  fastify.post<{ Params: { id: string }; Body: SaveGameRequest }>(
    '/:id/save',
    { schema: saveGameSchema },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: SaveGameRequest }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { name } = request.body;

      try {
        const game = gameRepo.findById(id);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${id}`);
        }

        // Create snapshot of current state
        const session = gameRepo.getSession(id);
        const snapshot = {
          game,
          session,
        };

        const slot = saveRepo.save(id, name, snapshot);
        return reply.send({ slot });
      } catch (error) {
        request.log.error(error, 'Failed to save game');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to save game');
      }
    }
  );

  /**
   * POST /api/game/:id/load
   * Load game from slot
   */
  fastify.post<{ Params: { id: string }; Body: LoadGameRequest }>(
    '/:id/load',
    { schema: loadGameSchema },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: LoadGameRequest }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { slotId } = request.body;

      try {
        const saveData = saveRepo.load(slotId);
        if (!saveData) {
          return sendError(reply, 404, 'SAVE_NOT_FOUND', `Save slot not found: ${slotId}`);
        }

        // Verify the save belongs to this game
        if (saveData.slot.gameId !== id) {
          return sendError(reply, 400, 'INVALID_SAVE', 'Save does not belong to this game');
        }

        const engine = getGameEngine();
        const gameState = await engine.loadGame(id);

        if (!gameState) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${id}`);
        }

        const session = gameRepo.getSession(id);

        // Broadcast state change
        broadcastManager.broadcast(id, {
          type: 'state_changed',
          state: gameState,
        });

        return reply.send({ session });
      } catch (error) {
        request.log.error(error, 'Failed to load game');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to load game');
      }
    }
  );

  /**
   * GET /api/game/:id/events (SSE)
   * Subscribe to real-time events
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id/events',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      // Verify game exists
      const game = gameRepo.findById(id);
      if (!game) {
        return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${id}`);
      }

      // Set up SSE
      setupSSEResponse(reply);

      // Subscribe to broadcasts
      const clientId = broadcastManager.subscribe(id, reply);

      // Send initial state
      const engine = getGameEngine();
      const editorState = engine.getEditorState(id);

      // Send initial game state
      broadcastManager.send(clientId, {
        type: 'state_changed',
        state: game,
      });

      // Send initial editor state
      broadcastManager.send(clientId, {
        type: 'editor_state',
        editorState: {
          pending: editorState.pending !== null,
          editedContent: editorState.editedContent,
          status: editorState.status === 'accepting' ? 'idle' : editorState.status as 'idle' | 'editing' | 'regenerating',
        },
      });

      // Handle disconnect
      request.raw.on('close', () => {
        broadcastManager.unsubscribe(id, clientId);
      });

      // Don't end the response - keep it open for SSE
      return reply;
    }
  );

  /**
   * GET /api/game/:id/pending
   * Get pending generated content
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id/pending',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      try {
        const game = gameRepo.findById(id);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${id}`);
        }

        const engine = getGameEngine();
        const pending = engine.getPendingContent(id);
        const editorState = engine.getEditorState(id);

        return reply.send({
          pending,
          editorState,
        });
      } catch (error) {
        request.log.error(error, 'Failed to get pending content');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to get pending content');
      }
    }
  );

  /**
   * PUT /api/game/:id/editor
   * Update editor state
   */
  fastify.put<{ Params: { id: string }; Body: EditorUpdateRequest }>(
    '/:id/editor',
    { schema: editorUpdateSchema },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: EditorUpdateRequest }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { editedContent, status } = request.body;

      try {
        const game = gameRepo.findById(id);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${id}`);
        }

        const engine = getGameEngine();
        const updates: Partial<DMEditorState> = {};

        if (editedContent !== undefined) {
          updates.editedContent = editedContent;
        }
        if (status !== undefined) {
          updates.status = status;
        }

        await engine.updateEditorState(id, updates);
        const editorState = engine.getEditorState(id);

        // Broadcast editor state update
        broadcastManager.broadcast(id, {
          type: 'editor_state',
          editorState: {
            pending: editorState.pending !== null,
            editedContent: editorState.editedContent,
            status: editorState.status === 'accepting' || editorState.status === 'generating'
              ? 'idle'
              : editorState.status as 'idle' | 'editing' | 'regenerating',
          },
        });

        return reply.send({ editorState });
      } catch (error) {
        request.log.error(error, 'Failed to update editor state');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to update editor state');
      }
    }
  );

  /**
   * POST /api/game/:id/submit
   * Submit DM-approved content
   */
  fastify.post<{ Params: { id: string }; Body: SubmitRequest }>(
    '/:id/submit',
    { schema: submitSchema },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: SubmitRequest }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { action } = request.body;

      try {
        const game = gameRepo.findById(id);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${id}`);
        }

        const engine = getGameEngine();
        const event = await engine.submit(id, action);

        // Get updated game state
        const updatedGame = gameRepo.findById(id);
        const session = gameRepo.getSession(id);

        // Broadcast state change
        if (updatedGame) {
          broadcastManager.broadcast(id, {
            type: 'state_changed',
            state: updatedGame,
          });
        }

        return reply.send({
          event,
          session,
        });
      } catch (error) {
        request.log.error(error, 'Failed to submit content');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to submit content');
      }
    }
  );

  /**
   * POST /api/game/:id/regenerate
   * Request AI regeneration
   */
  fastify.post<{ Params: { id: string }; Body: RegenerateRequest }>(
    '/:id/regenerate',
    { schema: regenerateSchema },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: RegenerateRequest }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { feedback } = request.body;

      try {
        const game = gameRepo.findById(id);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${id}`);
        }

        const engine = getGameEngine();

        // Start regeneration (async - result via SSE)
        engine.regenerate(id, feedback).catch((error) => {
          request.log.error(error, 'Regeneration failed');
          broadcastManager.broadcast(id, {
            type: 'generation_error',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });

        return reply.send({ status: 'generating' });
      } catch (error) {
        request.log.error(error, 'Failed to start regeneration');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to start regeneration');
      }
    }
  );

  /**
   * POST /api/game/:id/inject
   * Inject DM-authored content
   */
  fastify.post<{ Params: { id: string }; Body: InjectRequest }>(
    '/:id/inject',
    { schema: injectSchema },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: InjectRequest }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { content, eventType } = request.body;

      try {
        const game = gameRepo.findById(id);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${id}`);
        }

        const engine = getGameEngine();
        const event = await engine.inject(id, content, eventType);

        // Get updated game state and session
        const updatedGame = gameRepo.findById(id);
        const session = gameRepo.getSession(id);

        // Broadcast state change
        if (updatedGame) {
          broadcastManager.broadcast(id, {
            type: 'state_changed',
            state: updatedGame,
          });
        }

        return reply.send({
          event,
          session,
        });
      } catch (error) {
        request.log.error(error, 'Failed to inject content');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to inject content');
      }
    }
  );

  /**
   * POST /api/game/:id/next
   * Trigger next content generation
   */
  fastify.post<{ Params: { id: string }; Body: NextRequest }>(
    '/:id/next',
    { schema: nextSchema },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: NextRequest }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { type, dmGuidance } = request.body;

      try {
        const game = gameRepo.findById(id);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${id}`);
        }

        const engine = getGameEngine();

        // Build options object, only including defined properties
        const options: { type?: GenerationType; dmGuidance?: string } = {};
        if (type !== undefined) {
          options.type = type;
        }
        if (dmGuidance !== undefined) {
          options.dmGuidance = dmGuidance;
        }

        // Start generation (async - result via SSE)
        engine.generateNext(id, options).catch((error) => {
          request.log.error(error, 'Generation failed');
          broadcastManager.broadcast(id, {
            type: 'generation_error',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });

        return reply.send({ status: 'generating' });
      } catch (error) {
        request.log.error(error, 'Failed to start generation');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to start generation');
      }
    }
  );

  /**
   * POST /api/game/:id/control
   * Set playback mode
   */
  fastify.post<{ Params: { id: string }; Body: ControlRequest }>(
    '/:id/control',
    { schema: controlSchema },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: ControlRequest }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { mode } = request.body;

      try {
        const game = gameRepo.findById(id);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${id}`);
        }

        const engine = getGameEngine();
        await engine.setPlaybackMode(id, mode);

        return reply.send({ mode });
      } catch (error) {
        request.log.error(error, 'Failed to set playback mode');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to set playback mode');
      }
    }
  );

  /**
   * GET /api/game/:id/status
   * Get system status and game stats
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id/status',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      try {
        const game = gameRepo.findById(id);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${id}`);
        }

        const session = gameRepo.getSession(id);
        if (!session) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game session not found: ${id}`);
        }

        // Get event counts
        const events = eventRepo.findByGame(id);
        const eventsThisTurn = events.filter((e) => e.turn === game.turn).length;

        // Get party size
        const partyMembers = partyRepo.findByGame(id);
        const partySize = partyMembers.length;

        // Get NPCs in current area
        const npcsPresent = session.currentArea.npcs.length;

        // Calculate session duration
        const sessionStart = new Date(game.createdAt).getTime();
        const sessionDuration = Date.now() - sessionStart;

        // Build system status (mostly placeholders for now)
        const system: SystemStatus = {
          ai: { status: 'ok' },
          tts: { status: 'ok', queueLength: 0 },
          db: { status: 'ok', lastSyncAt: new Date().toISOString() },
        };

        // Build observation
        const observation: GameObservation = {
          turn: game.turn,
          totalEvents: events.length,
          eventsThisTurn,
          currentLocation: session.currentArea.name,
          partySize,
          npcsPresent,
          sessionDuration,
        };

        return reply.send({
          system,
          observation,
        });
      } catch (error) {
        request.log.error(error, 'Failed to get status');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to get status');
      }
    }
  );
}
