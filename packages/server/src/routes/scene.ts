/**
 * Scene Routes
 *
 * API endpoints for scene management including listing, creating,
 * starting, completing scenes, and managing scene connections.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getDatabase } from '../db/index.js';
import {
  GameRepository,
  SceneRepository,
  SceneAvailabilityRepository,
  SceneConnectionRepository,
} from '../db/repositories/index.js';
import { SceneManager } from '../services/scene/index.js';
import type { CreateSceneManagedInput } from '../services/scene/types.js';
import type { CreateSceneConnectionInput } from '../db/repositories/scene-connection-repository.js';

// =============================================================================
// Zod Schemas
// =============================================================================

const GameIdParamsSchema = z.object({
  gameId: z.string().uuid(),
});

const SceneIdParamsSchema = z.object({
  gameId: z.string().uuid(),
  sceneId: z.string().uuid(),
});

const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const CreateSceneBodySchema = z.object({
  turn: z.number().int().min(0),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  sceneType: z.string().max(100).optional(),
  locationId: z.string().uuid().optional(),
  mood: z.string().max(100).optional(),
  stakes: z.string().max(500).optional(),
  autoUnlock: z.boolean().optional(),
  unlockedBy: z.string().max(200).optional(),
});

const StartSceneBodySchema = z.object({
  turn: z.number().int().min(0),
});

const CompleteSceneBodySchema = z.object({
  turn: z.number().int().min(0),
});

const CreateConnectionBodySchema = z.object({
  fromSceneId: z.string().uuid(),
  toSceneId: z.string().uuid(),
  connectionType: z.enum(['path', 'conditional', 'hidden', 'one-way', 'teleport']).optional(),
  description: z.string().max(500).optional(),
  requirements: z.object({
    items: z.array(z.string()).optional(),
    flags: z.array(z.string()).optional(),
    stats: z.record(z.string(), z.number()).optional(),
  }).optional(),
});

// =============================================================================
// Error Codes
// =============================================================================

const ErrorCodes = {
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  SCENE_NOT_FOUND: 'SCENE_NOT_FOUND',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SCENE_NOT_AVAILABLE: 'SCENE_NOT_AVAILABLE',
  SCENE_ALREADY_COMPLETED: 'SCENE_ALREADY_COMPLETED',
  SCENE_NOT_STARTED: 'SCENE_NOT_STARTED',
  CONNECTION_EXISTS: 'CONNECTION_EXISTS',
} as const;

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

function validateWithZod<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  reply: FastifyReply
): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ');
    sendError(reply, 400, ErrorCodes.VALIDATION_ERROR, errors);
    return null;
  }
  return result.data;
}

// =============================================================================
// Routes
// =============================================================================

export async function sceneRoutes(fastify: FastifyInstance) {
  const db = getDatabase();
  const gameRepo = new GameRepository(db);
  const sceneRepo = new SceneRepository(db);
  const availabilityRepo = new SceneAvailabilityRepository(db);
  const connectionRepo = new SceneConnectionRepository(db);

  const sceneManager = new SceneManager({
    sceneRepo,
    availabilityRepo,
    connectionRepo,
    gameRepo,
  });

  /**
   * GET /api/scene/:gameId
   * List all scenes for a game
   */
  fastify.get<{ Params: { gameId: string }; Querystring: Record<string, string> }>(
    '/:gameId',
    async (request: FastifyRequest<{ Params: { gameId: string }; Querystring: Record<string, string> }>, reply: FastifyReply) => {
      const params = validateWithZod(GameIdParamsSchema, request.params, reply);
      if (!params) return;

      const query = validateWithZod(PaginationQuerySchema, request.query, reply);
      if (!query) return;

      try {
        const game = gameRepo.findById(params.gameId);
        if (!game) {
          return sendError(reply, 404, ErrorCodes.GAME_NOT_FOUND, `Game not found: ${params.gameId}`);
        }

        const scenes = sceneRepo.findByGame(params.gameId, {
          limit: query.limit,
          offset: query.offset,
        });

        return reply.send({
          scenes,
          pagination: {
            limit: query.limit,
            offset: query.offset,
            count: scenes.length,
          },
        });
      } catch (error) {
        request.log.error(error, 'Failed to list scenes');
        return sendError(reply, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to list scenes');
      }
    }
  );

  /**
   * POST /api/scene/:gameId
   * Create a new scene
   */
  fastify.post<{ Params: { gameId: string }; Body: unknown }>(
    '/:gameId',
    async (request: FastifyRequest<{ Params: { gameId: string }; Body: unknown }>, reply: FastifyReply) => {
      const params = validateWithZod(GameIdParamsSchema, request.params, reply);
      if (!params) return;

      const body = validateWithZod(CreateSceneBodySchema, request.body, reply);
      if (!body) return;

      try {
        const game = gameRepo.findById(params.gameId);
        if (!game) {
          return sendError(reply, 404, ErrorCodes.GAME_NOT_FOUND, `Game not found: ${params.gameId}`);
        }

        // Build input with only defined properties to satisfy exactOptionalPropertyTypes
        const createInput: CreateSceneManagedInput = {
          gameId: params.gameId,
          turn: body.turn,
        };
        if (body.name !== undefined) createInput.name = body.name;
        if (body.description !== undefined) createInput.description = body.description;
        if (body.sceneType !== undefined) createInput.sceneType = body.sceneType;
        if (body.locationId !== undefined) createInput.locationId = body.locationId;
        if (body.mood !== undefined) createInput.mood = body.mood;
        if (body.stakes !== undefined) createInput.stakes = body.stakes;
        if (body.autoUnlock !== undefined) createInput.autoUnlock = body.autoUnlock;
        if (body.unlockedBy !== undefined) createInput.unlockedBy = body.unlockedBy;

        const scene = sceneManager.createScene(createInput);

        return reply.status(201).send({ scene });
      } catch (error) {
        request.log.error(error, 'Failed to create scene');
        return sendError(reply, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to create scene');
      }
    }
  );

  /**
   * GET /api/scene/:gameId/available
   * Get available (unlocked) scenes for a game
   */
  fastify.get<{ Params: { gameId: string } }>(
    '/:gameId/available',
    async (request: FastifyRequest<{ Params: { gameId: string } }>, reply: FastifyReply) => {
      const params = validateWithZod(GameIdParamsSchema, request.params, reply);
      if (!params) return;

      try {
        const game = gameRepo.findById(params.gameId);
        if (!game) {
          return sendError(reply, 404, ErrorCodes.GAME_NOT_FOUND, `Game not found: ${params.gameId}`);
        }

        const scenes = sceneManager.getAvailableScenes(params.gameId);

        return reply.send({ scenes });
      } catch (error) {
        request.log.error(error, 'Failed to get available scenes');
        return sendError(reply, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to get available scenes');
      }
    }
  );

  /**
   * GET /api/scene/:gameId/current
   * Get the current active scene for a game
   */
  fastify.get<{ Params: { gameId: string } }>(
    '/:gameId/current',
    async (request: FastifyRequest<{ Params: { gameId: string } }>, reply: FastifyReply) => {
      const params = validateWithZod(GameIdParamsSchema, request.params, reply);
      if (!params) return;

      try {
        const game = gameRepo.findById(params.gameId);
        if (!game) {
          return sendError(reply, 404, ErrorCodes.GAME_NOT_FOUND, `Game not found: ${params.gameId}`);
        }

        const scene = sceneManager.getCurrentScene(params.gameId);

        return reply.send({ scene });
      } catch (error) {
        request.log.error(error, 'Failed to get current scene');
        return sendError(reply, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to get current scene');
      }
    }
  );

  /**
   * GET /api/scene/:gameId/:sceneId
   * Get scene details (summary with metadata)
   */
  fastify.get<{ Params: { gameId: string; sceneId: string } }>(
    '/:gameId/:sceneId',
    async (request: FastifyRequest<{ Params: { gameId: string; sceneId: string } }>, reply: FastifyReply) => {
      const params = validateWithZod(SceneIdParamsSchema, request.params, reply);
      if (!params) return;

      try {
        const game = gameRepo.findById(params.gameId);
        if (!game) {
          return sendError(reply, 404, ErrorCodes.GAME_NOT_FOUND, `Game not found: ${params.gameId}`);
        }

        const summary = sceneManager.getSceneSummary(params.gameId, params.sceneId);
        if (!summary) {
          return sendError(reply, 404, ErrorCodes.SCENE_NOT_FOUND, `Scene not found: ${params.sceneId}`);
        }

        // Get connected scenes for navigation
        const connections = connectionRepo.findFromScene(params.gameId, params.sceneId);
        const connectedScenes = sceneManager.getConnectedScenes(params.gameId, params.sceneId);

        return reply.send({
          ...summary,
          connections,
          connectedScenes,
        });
      } catch (error) {
        request.log.error(error, 'Failed to get scene details');
        return sendError(reply, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to get scene details');
      }
    }
  );

  /**
   * POST /api/scene/:gameId/:sceneId/start
   * Start a scene, making it the current active scene
   */
  fastify.post<{ Params: { gameId: string; sceneId: string }; Body: unknown }>(
    '/:gameId/:sceneId/start',
    async (request: FastifyRequest<{ Params: { gameId: string; sceneId: string }; Body: unknown }>, reply: FastifyReply) => {
      const params = validateWithZod(SceneIdParamsSchema, request.params, reply);
      if (!params) return;

      const body = validateWithZod(StartSceneBodySchema, request.body, reply);
      if (!body) return;

      try {
        const game = gameRepo.findById(params.gameId);
        if (!game) {
          return sendError(reply, 404, ErrorCodes.GAME_NOT_FOUND, `Game not found: ${params.gameId}`);
        }

        // Check scene exists
        const existingScene = sceneRepo.findById(params.sceneId);
        if (!existingScene) {
          return sendError(reply, 404, ErrorCodes.SCENE_NOT_FOUND, `Scene not found: ${params.sceneId}`);
        }

        // Check scene belongs to game
        if (existingScene.gameId !== params.gameId) {
          return sendError(reply, 400, ErrorCodes.INVALID_TRANSITION, `Scene ${params.sceneId} does not belong to game ${params.gameId}`);
        }

        // Check scene is not already completed
        if (existingScene.status === 'completed') {
          return sendError(reply, 400, ErrorCodes.SCENE_ALREADY_COMPLETED, `Scene ${params.sceneId} is already completed`);
        }

        // Check scene is not already abandoned
        if (existingScene.status === 'abandoned') {
          return sendError(reply, 400, ErrorCodes.INVALID_TRANSITION, `Scene ${params.sceneId} was abandoned and cannot be started`);
        }

        const scene = sceneManager.startScene({
          gameId: params.gameId,
          sceneId: params.sceneId,
          turn: body.turn,
        });

        return reply.send({ scene });
      } catch (error) {
        request.log.error(error, 'Failed to start scene');
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            return sendError(reply, 404, ErrorCodes.SCENE_NOT_FOUND, error.message);
          }
          if (error.message.includes('does not belong')) {
            return sendError(reply, 400, ErrorCodes.INVALID_TRANSITION, error.message);
          }
        }
        return sendError(reply, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to start scene');
      }
    }
  );

  /**
   * POST /api/scene/:gameId/:sceneId/complete
   * Complete a scene
   */
  fastify.post<{ Params: { gameId: string; sceneId: string }; Body: unknown }>(
    '/:gameId/:sceneId/complete',
    async (request: FastifyRequest<{ Params: { gameId: string; sceneId: string }; Body: unknown }>, reply: FastifyReply) => {
      const params = validateWithZod(SceneIdParamsSchema, request.params, reply);
      if (!params) return;

      const body = validateWithZod(CompleteSceneBodySchema, request.body, reply);
      if (!body) return;

      try {
        const game = gameRepo.findById(params.gameId);
        if (!game) {
          return sendError(reply, 404, ErrorCodes.GAME_NOT_FOUND, `Game not found: ${params.gameId}`);
        }

        // Check scene exists
        const existingScene = sceneRepo.findById(params.sceneId);
        if (!existingScene) {
          return sendError(reply, 404, ErrorCodes.SCENE_NOT_FOUND, `Scene not found: ${params.sceneId}`);
        }

        // Check scene belongs to game
        if (existingScene.gameId !== params.gameId) {
          return sendError(reply, 400, ErrorCodes.INVALID_TRANSITION, `Scene ${params.sceneId} does not belong to game ${params.gameId}`);
        }

        // Check scene is not already completed
        if (existingScene.status === 'completed') {
          return sendError(reply, 400, ErrorCodes.SCENE_ALREADY_COMPLETED, `Scene ${params.sceneId} is already completed`);
        }

        // Check scene is not abandoned
        if (existingScene.status === 'abandoned') {
          return sendError(reply, 400, ErrorCodes.INVALID_TRANSITION, `Scene ${params.sceneId} was abandoned and cannot be completed`);
        }

        const scene = sceneManager.completeScene({
          gameId: params.gameId,
          sceneId: params.sceneId,
          turn: body.turn,
        });

        return reply.send({ scene });
      } catch (error) {
        request.log.error(error, 'Failed to complete scene');
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            return sendError(reply, 404, ErrorCodes.SCENE_NOT_FOUND, error.message);
          }
          if (error.message.includes('does not belong')) {
            return sendError(reply, 400, ErrorCodes.INVALID_TRANSITION, error.message);
          }
        }
        return sendError(reply, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to complete scene');
      }
    }
  );

  /**
   * POST /api/scene/:gameId/connections
   * Add a connection between two scenes
   */
  fastify.post<{ Params: { gameId: string }; Body: unknown }>(
    '/:gameId/connections',
    async (request: FastifyRequest<{ Params: { gameId: string }; Body: unknown }>, reply: FastifyReply) => {
      const params = validateWithZod(GameIdParamsSchema, request.params, reply);
      if (!params) return;

      const body = validateWithZod(CreateConnectionBodySchema, request.body, reply);
      if (!body) return;

      try {
        const game = gameRepo.findById(params.gameId);
        if (!game) {
          return sendError(reply, 404, ErrorCodes.GAME_NOT_FOUND, `Game not found: ${params.gameId}`);
        }

        // Verify from scene exists and belongs to game
        const fromScene = sceneRepo.findById(body.fromSceneId);
        if (!fromScene) {
          return sendError(reply, 404, ErrorCodes.SCENE_NOT_FOUND, `Source scene not found: ${body.fromSceneId}`);
        }
        if (fromScene.gameId !== params.gameId) {
          return sendError(reply, 400, ErrorCodes.INVALID_TRANSITION, `Source scene ${body.fromSceneId} does not belong to game ${params.gameId}`);
        }

        // Verify to scene exists and belongs to game
        const toScene = sceneRepo.findById(body.toSceneId);
        if (!toScene) {
          return sendError(reply, 404, ErrorCodes.SCENE_NOT_FOUND, `Target scene not found: ${body.toSceneId}`);
        }
        if (toScene.gameId !== params.gameId) {
          return sendError(reply, 400, ErrorCodes.INVALID_TRANSITION, `Target scene ${body.toSceneId} does not belong to game ${params.gameId}`);
        }

        // Prevent self-connections
        if (body.fromSceneId === body.toSceneId) {
          return sendError(reply, 400, ErrorCodes.INVALID_TRANSITION, 'Cannot create a connection from a scene to itself');
        }

        // Build input with only defined properties to satisfy exactOptionalPropertyTypes
        const createInput: CreateSceneConnectionInput = {
          gameId: params.gameId,
          fromSceneId: body.fromSceneId,
          toSceneId: body.toSceneId,
        };
        if (body.connectionType !== undefined) createInput.connectionType = body.connectionType;
        if (body.description !== undefined) createInput.description = body.description;
        if (body.requirements !== undefined) {
          // Build requirements object with only defined properties
          const requirements: { items?: string[]; flags?: string[]; stats?: Record<string, number> } = {};
          if (body.requirements.items !== undefined) requirements.items = body.requirements.items;
          if (body.requirements.flags !== undefined) requirements.flags = body.requirements.flags;
          if (body.requirements.stats !== undefined) requirements.stats = body.requirements.stats;
          createInput.requirements = requirements;
        }

        const connection = connectionRepo.create(createInput);

        return reply.status(201).send({ connection });
      } catch (error) {
        request.log.error(error, 'Failed to create connection');
        return sendError(reply, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to create connection');
      }
    }
  );

  /**
   * GET /api/scene/:gameId/connections
   * List all connections for a game
   */
  fastify.get<{ Params: { gameId: string }; Querystring: { fromSceneId?: string } }>(
    '/:gameId/connections',
    async (request: FastifyRequest<{ Params: { gameId: string }; Querystring: { fromSceneId?: string } }>, reply: FastifyReply) => {
      const params = validateWithZod(GameIdParamsSchema, request.params, reply);
      if (!params) return;

      const { fromSceneId } = request.query;

      try {
        const game = gameRepo.findById(params.gameId);
        if (!game) {
          return sendError(reply, 404, ErrorCodes.GAME_NOT_FOUND, `Game not found: ${params.gameId}`);
        }

        let connections;
        if (fromSceneId) {
          // Validate fromSceneId if provided
          const fromSceneIdSchema = z.string().uuid();
          const validatedFromSceneId = fromSceneIdSchema.safeParse(fromSceneId);
          if (!validatedFromSceneId.success) {
            return sendError(reply, 400, ErrorCodes.VALIDATION_ERROR, 'Invalid fromSceneId format');
          }
          connections = connectionRepo.findFromScene(params.gameId, validatedFromSceneId.data);
        } else {
          // Get all scenes and their connections
          const scenes = sceneRepo.findByGame(params.gameId, { limit: 1000 });
          connections = [];
          for (const scene of scenes) {
            const sceneConnections = connectionRepo.findFromScene(params.gameId, scene.id);
            connections.push(...sceneConnections);
          }
        }

        return reply.send({ connections });
      } catch (error) {
        request.log.error(error, 'Failed to list connections');
        return sendError(reply, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to list connections');
      }
    }
  );
}
