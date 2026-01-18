/**
 * Evolution Routes
 *
 * API endpoints for entity evolution management including traits,
 * relationships, and DM approval workflow.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../db/index.js';
import { GameRepository } from '../db/repositories/index.js';
import { TraitRepository, EntityType } from '../db/repositories/trait-repository.js';
import { RelationshipRepository } from '../db/repositories/relationship-repository.js';
import { PendingEvolutionRepository, UpdateEvolutionInput } from '../db/repositories/pending-evolution-repository.js';
import { EvolutionService } from '../services/evolution/evolution-service.js';

// =============================================================================
// Types
// =============================================================================

interface ApproveRequest {
  dmNotes?: string;
}

interface EditRequest {
  trait?: string;
  targetType?: EntityType;
  targetId?: string;
  dimension?: string;
  oldValue?: number;
  newValue?: number;
  reason?: string;
  dmNotes?: string;
}

interface RefuseRequest {
  dmNotes?: string;
}

// =============================================================================
// Request Validation Schemas
// =============================================================================

const approveSchema = {
  body: {
    type: 'object',
    properties: {
      dmNotes: { type: 'string', maxLength: 1000 },
    },
  },
};

const editSchema = {
  body: {
    type: 'object',
    properties: {
      trait: { type: 'string', maxLength: 100 },
      targetType: { type: 'string', enum: ['player', 'character', 'npc', 'location'] },
      targetId: { type: 'string', maxLength: 100 },
      dimension: { type: 'string', enum: ['trust', 'respect', 'affection', 'fear', 'resentment', 'debt'] },
      oldValue: { type: 'number', minimum: 0, maximum: 1 },
      newValue: { type: 'number', minimum: 0, maximum: 1 },
      reason: { type: 'string', maxLength: 500 },
      dmNotes: { type: 'string', maxLength: 1000 },
    },
  },
};

const refuseSchema = {
  body: {
    type: 'object',
    properties: {
      dmNotes: { type: 'string', maxLength: 1000 },
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

function isValidEntityType(type: string): type is EntityType {
  return ['player', 'character', 'npc', 'location'].includes(type);
}

// =============================================================================
// Routes
// =============================================================================

export async function evolutionRoutes(fastify: FastifyInstance) {
  const db = getDatabase();
  const gameRepo = new GameRepository(db);
  const traitRepo = new TraitRepository(db);
  const relationshipRepo = new RelationshipRepository(db);
  const pendingRepo = new PendingEvolutionRepository(db);

  const evolutionService = new EvolutionService({
    traitRepo,
    relationshipRepo,
    pendingRepo,
  });

  /**
   * GET /api/evolution/:gameId
   * Get pending evolutions for a game
   */
  fastify.get<{ Params: { gameId: string }; Querystring: { all?: string } }>(
    '/:gameId',
    async (request: FastifyRequest<{ Params: { gameId: string }; Querystring: { all?: string } }>, reply: FastifyReply) => {
      const { gameId } = request.params;
      const showAll = request.query.all === 'true';

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        const evolutions = evolutionService.getPendingEvolutions(gameId, !showAll);

        return reply.send({ evolutions });
      } catch (error) {
        request.log.error(error, 'Failed to get evolutions');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to get evolutions');
      }
    }
  );

  /**
   * GET /api/evolution/:gameId/:evolutionId
   * Get a specific evolution by ID
   */
  fastify.get<{ Params: { gameId: string; evolutionId: string } }>(
    '/:gameId/:evolutionId',
    async (request: FastifyRequest<{ Params: { gameId: string; evolutionId: string } }>, reply: FastifyReply) => {
      const { gameId, evolutionId } = request.params;

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        const evolution = pendingRepo.findById(evolutionId);
        if (!evolution) {
          return sendError(reply, 404, 'EVOLUTION_NOT_FOUND', `Evolution not found: ${evolutionId}`);
        }

        if (evolution.gameId !== gameId) {
          return sendError(reply, 400, 'INVALID_EVOLUTION', 'Evolution does not belong to this game');
        }

        return reply.send({ evolution });
      } catch (error) {
        request.log.error(error, 'Failed to get evolution');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to get evolution');
      }
    }
  );

  /**
   * POST /api/evolution/:gameId/:evolutionId/approve
   * Approve a pending evolution
   */
  fastify.post<{ Params: { gameId: string; evolutionId: string }; Body: ApproveRequest }>(
    '/:gameId/:evolutionId/approve',
    { schema: approveSchema },
    async (
      request: FastifyRequest<{ Params: { gameId: string; evolutionId: string }; Body: ApproveRequest }>,
      reply: FastifyReply
    ) => {
      const { gameId, evolutionId } = request.params;
      const { dmNotes } = request.body;

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        // Verify evolution exists and belongs to this game
        const evolution = pendingRepo.findById(evolutionId);
        if (!evolution) {
          return sendError(reply, 404, 'EVOLUTION_NOT_FOUND', `Evolution not found: ${evolutionId}`);
        }
        if (evolution.gameId !== gameId) {
          return sendError(reply, 400, 'INVALID_EVOLUTION', 'Evolution does not belong to this game');
        }

        // Approve the evolution
        evolutionService.approve(evolutionId, dmNotes);

        // Get updated evolution
        const updated = pendingRepo.findById(evolutionId);

        return reply.send({ evolution: updated });
      } catch (error) {
        request.log.error(error, 'Failed to approve evolution');
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            return sendError(reply, 404, 'EVOLUTION_NOT_FOUND', error.message);
          }
          if (error.message.includes('Cannot approve')) {
            return sendError(reply, 400, 'INVALID_STATUS', error.message);
          }
        }
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to approve evolution');
      }
    }
  );

  /**
   * POST /api/evolution/:gameId/:evolutionId/edit
   * Edit and approve a pending evolution
   */
  fastify.post<{ Params: { gameId: string; evolutionId: string }; Body: EditRequest }>(
    '/:gameId/:evolutionId/edit',
    { schema: editSchema },
    async (
      request: FastifyRequest<{ Params: { gameId: string; evolutionId: string }; Body: EditRequest }>,
      reply: FastifyReply
    ) => {
      const { gameId, evolutionId } = request.params;
      const { trait, targetType, targetId, dimension, oldValue, newValue, reason, dmNotes } = request.body;

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        // Verify evolution exists and belongs to this game
        const evolution = pendingRepo.findById(evolutionId);
        if (!evolution) {
          return sendError(reply, 404, 'EVOLUTION_NOT_FOUND', `Evolution not found: ${evolutionId}`);
        }
        if (evolution.gameId !== gameId) {
          return sendError(reply, 400, 'INVALID_EVOLUTION', 'Evolution does not belong to this game');
        }

        // Build changes object
        const changes: UpdateEvolutionInput = {};
        if (trait !== undefined) changes.trait = trait;
        if (targetType !== undefined) changes.targetType = targetType;
        if (targetId !== undefined) changes.targetId = targetId;
        if (dimension !== undefined) changes.dimension = dimension as 'trust' | 'respect' | 'affection' | 'fear' | 'resentment' | 'debt';
        if (oldValue !== undefined) changes.oldValue = oldValue;
        if (newValue !== undefined) changes.newValue = newValue;
        if (reason !== undefined) changes.reason = reason;

        // Edit and approve the evolution
        evolutionService.edit(evolutionId, changes, dmNotes);

        // Get updated evolution
        const updated = pendingRepo.findById(evolutionId);

        return reply.send({ evolution: updated });
      } catch (error) {
        request.log.error(error, 'Failed to edit evolution');
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            return sendError(reply, 404, 'EVOLUTION_NOT_FOUND', error.message);
          }
          if (error.message.includes('Cannot edit')) {
            return sendError(reply, 400, 'INVALID_STATUS', error.message);
          }
        }
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to edit evolution');
      }
    }
  );

  /**
   * POST /api/evolution/:gameId/:evolutionId/refuse
   * Refuse a pending evolution
   */
  fastify.post<{ Params: { gameId: string; evolutionId: string }; Body: RefuseRequest }>(
    '/:gameId/:evolutionId/refuse',
    { schema: refuseSchema },
    async (
      request: FastifyRequest<{ Params: { gameId: string; evolutionId: string }; Body: RefuseRequest }>,
      reply: FastifyReply
    ) => {
      const { gameId, evolutionId } = request.params;
      const { dmNotes } = request.body;

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        // Verify evolution exists and belongs to this game
        const evolution = pendingRepo.findById(evolutionId);
        if (!evolution) {
          return sendError(reply, 404, 'EVOLUTION_NOT_FOUND', `Evolution not found: ${evolutionId}`);
        }
        if (evolution.gameId !== gameId) {
          return sendError(reply, 400, 'INVALID_EVOLUTION', 'Evolution does not belong to this game');
        }

        // Refuse the evolution
        evolutionService.refuse(evolutionId, dmNotes);

        // Get updated evolution
        const updated = pendingRepo.findById(evolutionId);

        return reply.send({ evolution: updated });
      } catch (error) {
        request.log.error(error, 'Failed to refuse evolution');
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            return sendError(reply, 404, 'EVOLUTION_NOT_FOUND', error.message);
          }
          if (error.message.includes('Cannot refuse')) {
            return sendError(reply, 400, 'INVALID_STATUS', error.message);
          }
        }
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to refuse evolution');
      }
    }
  );

  /**
   * GET /api/evolution/:gameId/traits/:entityType/:entityId
   * Get traits for a specific entity
   */
  fastify.get<{ Params: { gameId: string; entityType: string; entityId: string } }>(
    '/:gameId/traits/:entityType/:entityId',
    async (
      request: FastifyRequest<{ Params: { gameId: string; entityType: string; entityId: string } }>,
      reply: FastifyReply
    ) => {
      const { gameId, entityType, entityId } = request.params;

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        // Validate entity type
        if (!isValidEntityType(entityType)) {
          return sendError(reply, 400, 'INVALID_ENTITY_TYPE', `Invalid entity type: ${entityType}`);
        }

        const traits = traitRepo.findByEntity(gameId, entityType, entityId);

        return reply.send({
          entityType,
          entityId,
          traits: traits.map(t => ({
            id: t.id,
            trait: t.trait,
            acquiredTurn: t.acquiredTurn,
            status: t.status,
          })),
        });
      } catch (error) {
        request.log.error(error, 'Failed to get traits');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to get traits');
      }
    }
  );

  /**
   * GET /api/evolution/:gameId/relationships/:entityType/:entityId
   * Get relationships for a specific entity
   */
  fastify.get<{ Params: { gameId: string; entityType: string; entityId: string } }>(
    '/:gameId/relationships/:entityType/:entityId',
    async (
      request: FastifyRequest<{ Params: { gameId: string; entityType: string; entityId: string } }>,
      reply: FastifyReply
    ) => {
      const { gameId, entityType, entityId } = request.params;

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        // Validate entity type
        if (!isValidEntityType(entityType)) {
          return sendError(reply, 400, 'INVALID_ENTITY_TYPE', `Invalid entity type: ${entityType}`);
        }

        const relationships = relationshipRepo.findByEntity(gameId, { type: entityType, id: entityId });

        return reply.send({
          entityType,
          entityId,
          relationships: relationships.map(rel => {
            // Determine which end is "other"
            const isFrom = rel.from.type === entityType && rel.from.id === entityId;
            const other = isFrom ? rel.to : rel.from;

            return {
              id: rel.id,
              targetType: other.type,
              targetId: other.id,
              dimensions: {
                trust: rel.trust,
                respect: rel.respect,
                affection: rel.affection,
                fear: rel.fear,
                resentment: rel.resentment,
                debt: rel.debt,
              },
              updatedTurn: rel.updatedTurn,
            };
          }),
        });
      } catch (error) {
        request.log.error(error, 'Failed to get relationships');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to get relationships');
      }
    }
  );

  /**
   * GET /api/evolution/:gameId/entity/:entityType/:entityId
   * Get full entity summary (traits + relationships with labels)
   */
  fastify.get<{ Params: { gameId: string; entityType: string; entityId: string } }>(
    '/:gameId/entity/:entityType/:entityId',
    async (
      request: FastifyRequest<{ Params: { gameId: string; entityType: string; entityId: string } }>,
      reply: FastifyReply
    ) => {
      const { gameId, entityType, entityId } = request.params;

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        // Validate entity type
        if (!isValidEntityType(entityType)) {
          return sendError(reply, 400, 'INVALID_ENTITY_TYPE', `Invalid entity type: ${entityType}`);
        }

        const summary = evolutionService.getEntitySummary(gameId, entityType, entityId);

        return reply.send({ entity: summary });
      } catch (error) {
        request.log.error(error, 'Failed to get entity summary');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to get entity summary');
      }
    }
  );

  /**
   * GET /api/evolution/catalog/traits
   * Get the predefined trait catalog
   */
  fastify.get(
    '/catalog/traits',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const catalog = traitRepo.getTraitCatalog();

        return reply.send({ traits: catalog });
      } catch (error) {
        fastify.log.error(error, 'Failed to get trait catalog');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to get trait catalog');
      }
    }
  );
}
