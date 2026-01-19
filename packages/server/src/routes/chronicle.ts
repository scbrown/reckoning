/**
 * Chronicle Routes
 *
 * API endpoints for querying structured events and player behavior patterns.
 * Supports the structured events system (SEVT) for emergence detection.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ActorType, TargetType, ActionCategory } from '@reckoning/shared/game';
import { ALL_ACTIONS, ACTION_CATEGORIES, isValidAction, isValidActionCategory } from '@reckoning/shared/game';
import { getDatabase } from '../db/index.js';
import { EventRepository, GameRepository } from '../db/repositories/index.js';
import { PatternObserver } from '../services/chronicle/pattern-observer.js';

// =============================================================================
// Types
// =============================================================================

interface PaginationQuery {
  limit?: string;
  offset?: string;
}

interface ByActionQuery extends PaginationQuery {
  gameId: string;
  actions: string; // Comma-separated list of actions
}

interface ByActorQuery extends PaginationQuery {
  gameId: string;
  actorType: ActorType;
  actorId: string;
}

interface ByTargetQuery extends PaginationQuery {
  gameId: string;
  targetType: TargetType;
  targetId: string;
}

interface ByCategoryQuery extends PaginationQuery {
  gameId: string;
  category: ActionCategory;
}

interface PatternParams {
  gameId: string;
  playerId: string;
}

interface PatternQuery {
  turnStart?: string;
  turnEnd?: string;
  limit?: string;
}

// =============================================================================
// Request Validation Schemas
// =============================================================================

const byActionSchema = {
  querystring: {
    type: 'object',
    required: ['gameId', 'actions'],
    properties: {
      gameId: { type: 'string', format: 'uuid' },
      actions: { type: 'string', minLength: 1 },
      limit: { type: 'string', pattern: '^[0-9]+$' },
      offset: { type: 'string', pattern: '^[0-9]+$' },
    },
  },
};

const byActorSchema = {
  querystring: {
    type: 'object',
    required: ['gameId', 'actorType', 'actorId'],
    properties: {
      gameId: { type: 'string', format: 'uuid' },
      actorType: { type: 'string', enum: ['player', 'character', 'npc', 'system'] },
      actorId: { type: 'string', minLength: 1 },
      limit: { type: 'string', pattern: '^[0-9]+$' },
      offset: { type: 'string', pattern: '^[0-9]+$' },
    },
  },
};

const byTargetSchema = {
  querystring: {
    type: 'object',
    required: ['gameId', 'targetType', 'targetId'],
    properties: {
      gameId: { type: 'string', format: 'uuid' },
      targetType: { type: 'string', enum: ['player', 'character', 'npc', 'area', 'object'] },
      targetId: { type: 'string', minLength: 1 },
      limit: { type: 'string', pattern: '^[0-9]+$' },
      offset: { type: 'string', pattern: '^[0-9]+$' },
    },
  },
};

const byCategorySchema = {
  querystring: {
    type: 'object',
    required: ['gameId', 'category'],
    properties: {
      gameId: { type: 'string', format: 'uuid' },
      category: { type: 'string', enum: [...ACTION_CATEGORIES] },
      limit: { type: 'string', pattern: '^[0-9]+$' },
      offset: { type: 'string', pattern: '^[0-9]+$' },
    },
  },
};

const patternParamsSchema = {
  params: {
    type: 'object',
    required: ['gameId', 'playerId'],
    properties: {
      gameId: { type: 'string', format: 'uuid' },
      playerId: { type: 'string', minLength: 1 },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      turnStart: { type: 'string', pattern: '^[0-9]+$' },
      turnEnd: { type: 'string', pattern: '^[0-9]+$' },
      limit: { type: 'string', pattern: '^[0-9]+$' },
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

function parsePagination(query: PaginationQuery): { limit: number; offset: number } {
  const limit = Math.min(parseInt(query.limit || '100', 10), 1000);
  const offset = parseInt(query.offset || '0', 10);
  return { limit, offset };
}

// =============================================================================
// Routes
// =============================================================================

export async function chronicleRoutes(fastify: FastifyInstance) {
  const db = getDatabase();
  const eventRepo = new EventRepository(db);
  const gameRepo = new GameRepository(db);
  const patternObserver = new PatternObserver(eventRepo);

  /**
   * GET /api/chronicle/events/by-action
   * Query events by action verbs
   */
  fastify.get<{ Querystring: ByActionQuery }>(
    '/events/by-action',
    { schema: byActionSchema },
    async (request: FastifyRequest<{ Querystring: ByActionQuery }>, reply: FastifyReply) => {
      const { gameId, actions: actionsParam } = request.query;
      const { limit, offset } = parsePagination(request.query);

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        // Parse and validate actions
        const actions = actionsParam.split(',').map(a => a.trim()).filter(Boolean);
        const invalidActions = actions.filter(a => !isValidAction(a));
        if (invalidActions.length > 0) {
          return sendError(
            reply,
            400,
            'INVALID_ACTIONS',
            `Invalid actions: ${invalidActions.join(', ')}. Valid actions: ${ALL_ACTIONS.join(', ')}`
          );
        }

        if (actions.length === 0) {
          return sendError(reply, 400, 'EMPTY_ACTIONS', 'At least one action must be specified');
        }

        const events = eventRepo.findByActions(gameId, actions, { limit, offset });
        const total = eventRepo.countByActions(gameId, actions);

        return reply.send({
          events,
          pagination: {
            limit,
            offset,
            total,
            hasMore: offset + events.length < total,
          },
        });
      } catch (error) {
        request.log.error(error, 'Failed to query events by action');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to query events');
      }
    }
  );

  /**
   * GET /api/chronicle/events/by-actor
   * Query events by actor (type and ID)
   */
  fastify.get<{ Querystring: ByActorQuery }>(
    '/events/by-actor',
    { schema: byActorSchema },
    async (request: FastifyRequest<{ Querystring: ByActorQuery }>, reply: FastifyReply) => {
      const { gameId, actorType, actorId } = request.query;
      const { limit, offset } = parsePagination(request.query);

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        const events = eventRepo.findByActor(gameId, actorType, actorId, { limit, offset });

        // Count total (need to query without limit for accurate count)
        const allEvents = eventRepo.findByActor(gameId, actorType, actorId, { limit: 10000 });
        const total = allEvents.length;

        return reply.send({
          events,
          pagination: {
            limit,
            offset,
            total,
            hasMore: offset + events.length < total,
          },
        });
      } catch (error) {
        request.log.error(error, 'Failed to query events by actor');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to query events');
      }
    }
  );

  /**
   * GET /api/chronicle/events/by-target
   * Query events by target (type and ID)
   */
  fastify.get<{ Querystring: ByTargetQuery }>(
    '/events/by-target',
    { schema: byTargetSchema },
    async (request: FastifyRequest<{ Querystring: ByTargetQuery }>, reply: FastifyReply) => {
      const { gameId, targetType, targetId } = request.query;
      const { limit, offset } = parsePagination(request.query);

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        const events = eventRepo.findByTarget(gameId, targetType, targetId, { limit, offset });

        // Count total (need to query without limit for accurate count)
        const allEvents = eventRepo.findByTarget(gameId, targetType, targetId, { limit: 10000 });
        const total = allEvents.length;

        return reply.send({
          events,
          pagination: {
            limit,
            offset,
            total,
            hasMore: offset + events.length < total,
          },
        });
      } catch (error) {
        request.log.error(error, 'Failed to query events by target');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to query events');
      }
    }
  );

  /**
   * GET /api/chronicle/events/by-category
   * Query events by action category
   */
  fastify.get<{ Querystring: ByCategoryQuery }>(
    '/events/by-category',
    { schema: byCategorySchema },
    async (request: FastifyRequest<{ Querystring: ByCategoryQuery }>, reply: FastifyReply) => {
      const { gameId, category } = request.query;
      const { limit, offset } = parsePagination(request.query);

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        // Validate category
        if (!isValidActionCategory(category)) {
          return sendError(
            reply,
            400,
            'INVALID_CATEGORY',
            `Invalid category: ${category}. Valid categories: ${ACTION_CATEGORIES.join(', ')}`
          );
        }

        // Get actions for this category and query
        const { CATEGORY_TO_ACTIONS } = await import('@reckoning/shared/game');
        const categoryActions = [...CATEGORY_TO_ACTIONS[category]] as string[];

        const events = eventRepo.findByActions(gameId, categoryActions, { limit, offset });
        const total = eventRepo.countByActions(gameId, categoryActions);

        return reply.send({
          events,
          category,
          pagination: {
            limit,
            offset,
            total,
            hasMore: offset + events.length < total,
          },
        });
      } catch (error) {
        request.log.error(error, 'Failed to query events by category');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to query events');
      }
    }
  );

  /**
   * GET /api/chronicle/patterns/:gameId/:playerId
   * Get comprehensive behavior patterns for a player
   */
  fastify.get<{ Params: PatternParams; Querystring: PatternQuery }>(
    '/patterns/:gameId/:playerId',
    { schema: patternParamsSchema },
    async (
      request: FastifyRequest<{ Params: PatternParams; Querystring: PatternQuery }>,
      reply: FastifyReply
    ) => {
      const { gameId, playerId } = request.params;
      const { turnStart, turnEnd, limit } = request.query;

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        // Build analysis options
        const options: { turnRange?: { start: number; end: number }; limit?: number } = {};
        if (turnStart && turnEnd) {
          options.turnRange = {
            start: parseInt(turnStart, 10),
            end: parseInt(turnEnd, 10),
          };
        }
        if (limit) {
          options.limit = parseInt(limit, 10);
        }

        const patterns = patternObserver.getPlayerPatterns(gameId, playerId, options);

        return reply.send({ patterns });
      } catch (error) {
        request.log.error(error, 'Failed to get player patterns');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to get patterns');
      }
    }
  );

  /**
   * GET /api/chronicle/emergence/:gameId/:playerId
   * Get emergence data including action summary and behavioral analysis
   */
  fastify.get<{ Params: PatternParams; Querystring: PatternQuery }>(
    '/emergence/:gameId/:playerId',
    { schema: patternParamsSchema },
    async (
      request: FastifyRequest<{ Params: PatternParams; Querystring: PatternQuery }>,
      reply: FastifyReply
    ) => {
      const { gameId, playerId } = request.params;
      const { turnStart, turnEnd, limit } = request.query;

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        // Get action summary for the game
        const actionSummary = eventRepo.getActionSummary(gameId);
        const actionCounts: Record<string, number> = {};
        for (const [action, count] of actionSummary.entries()) {
          actionCounts[action] = count;
        }

        // Build analysis options
        const options: { turnRange?: { start: number; end: number }; limit?: number } = {};
        if (turnStart && turnEnd) {
          options.turnRange = {
            start: parseInt(turnStart, 10),
            end: parseInt(turnEnd, 10),
          };
        }
        if (limit) {
          options.limit = parseInt(limit, 10);
        }

        // Get player patterns
        const patterns = patternObserver.getPlayerPatterns(gameId, playerId, options);

        // Build emergence summary
        const emergence = {
          actionCounts,
          totalActions: Object.values(actionCounts).reduce((sum, count) => sum + count, 0),
          patterns,
          emergentTraits: patterns.dominantTraits,
          behavioralProfile: {
            mercyVsViolence: patterns.ratios.mercyVsViolence,
            honestyVsDeception: patterns.ratios.honestyVsDeception,
            helpfulVsHarmful: patterns.ratios.helpfulVsHarmful,
            socialApproach: patterns.socialApproach,
            initiatesViolence: patterns.violenceInitiation.initiatesViolence,
          },
        };

        return reply.send({ emergence });
      } catch (error) {
        request.log.error(error, 'Failed to get emergence data');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to get emergence data');
      }
    }
  );

  /**
   * GET /api/chronicle/actions
   * Get list of valid actions and categories (reference endpoint)
   */
  fastify.get('/actions', async (_request: FastifyRequest, reply: FastifyReply) => {
    const { CATEGORY_TO_ACTIONS } = await import('@reckoning/shared/game');

    const categories: Record<string, readonly string[]> = {};
    for (const category of ACTION_CATEGORIES) {
      categories[category] = CATEGORY_TO_ACTIONS[category];
    }

    return reply.send({
      actions: ALL_ACTIONS,
      categories,
    });
  });
}
