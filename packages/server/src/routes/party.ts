/**
 * Party Routes
 *
 * API endpoints for party management including members and health updates.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { CharacterStats } from '@reckoning/shared';
import { getDatabase } from '../db/index.js';
import {
  CharacterRepository,
  CharacterRole,
  PARTY_LIMITS,
} from '../db/repositories/index.js';
import { GameRepository } from '../db/repositories/index.js';

// =============================================================================
// Types
// =============================================================================

interface AddMemberRequest {
  name: string;
  description?: string;
  class?: string;
  role: CharacterRole;
  stats?: CharacterStats;
}

interface UpdateMemberRequest {
  name?: string;
  description?: string;
  class?: string;
  stats?: CharacterStats;
}

interface UpdateHealthRequest {
  characterId: string;
  health: number;
}

// =============================================================================
// Request Validation Schemas
// =============================================================================

const addMemberSchema = {
  body: {
    type: 'object',
    required: ['name', 'role'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 50 },
      description: { type: 'string', maxLength: 500 },
      class: { type: 'string', maxLength: 50 },
      role: { type: 'string', enum: ['player', 'member', 'companion'] },
      stats: {
        type: 'object',
        properties: {
          health: { type: 'number', minimum: 0 },
          maxHealth: { type: 'number', minimum: 1 },
        },
      },
    },
  },
};

const updateMemberSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 50 },
      description: { type: 'string', maxLength: 500 },
      class: { type: 'string', maxLength: 50 },
      stats: {
        type: 'object',
        properties: {
          health: { type: 'number', minimum: 0 },
          maxHealth: { type: 'number', minimum: 1 },
        },
      },
    },
  },
};

const updateHealthSchema = {
  body: {
    type: 'object',
    required: ['characterId', 'health'],
    properties: {
      characterId: { type: 'string', format: 'uuid' },
      health: { type: 'number', minimum: 0 },
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

export async function partyRoutes(fastify: FastifyInstance) {
  const db = getDatabase();
  const characterRepo = new CharacterRepository(db);
  const gameRepo = new GameRepository(db);

  /**
   * GET /api/party/:gameId
   * Get all party members for a game
   */
  fastify.get<{ Params: { gameId: string } }>(
    '/:gameId',
    async (request: FastifyRequest<{ Params: { gameId: string } }>, reply: FastifyReply) => {
      const { gameId } = request.params;

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        const members = characterRepo.findByParty(gameId);
        const remainingSlots = characterRepo.getRemainingSlots(gameId);

        return reply.send({
          members,
          limits: PARTY_LIMITS,
          remainingSlots,
        });
      } catch (error) {
        request.log.error(error, 'Failed to get party');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to get party');
      }
    }
  );

  /**
   * POST /api/party/:gameId/members
   * Add a new member to the party
   */
  fastify.post<{ Params: { gameId: string }; Body: AddMemberRequest }>(
    '/:gameId/members',
    { schema: addMemberSchema },
    async (
      request: FastifyRequest<{ Params: { gameId: string }; Body: AddMemberRequest }>,
      reply: FastifyReply
    ) => {
      const { gameId } = request.params;
      const { name, description, class: charClass, role, stats } = request.body;

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        // Check if we can add this role
        if (!characterRepo.canAddRole(gameId, role)) {
          return sendError(
            reply,
            400,
            'PARTY_LIMIT_EXCEEDED',
            `Cannot have more than ${PARTY_LIMITS[role]} ${role}(s) in party`
          );
        }

        const createInput: Parameters<typeof characterRepo.create>[0] = {
          partyId: gameId,
          name,
          role,
        };
        if (description !== undefined) createInput.description = description;
        if (charClass !== undefined) createInput.class = charClass;
        if (stats !== undefined) createInput.stats = stats;

        const member = characterRepo.create(createInput);

        return reply.status(201).send({ member });
      } catch (error) {
        request.log.error(error, 'Failed to add party member');
        if (error instanceof Error && error.message.includes('Party limit exceeded')) {
          return sendError(reply, 400, 'PARTY_LIMIT_EXCEEDED', error.message);
        }
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to add party member');
      }
    }
  );

  /**
   * PUT /api/party/:gameId/members/:memberId
   * Update a party member
   */
  fastify.put<{ Params: { gameId: string; memberId: string }; Body: UpdateMemberRequest }>(
    '/:gameId/members/:memberId',
    { schema: updateMemberSchema },
    async (
      request: FastifyRequest<{ Params: { gameId: string; memberId: string }; Body: UpdateMemberRequest }>,
      reply: FastifyReply
    ) => {
      const { gameId, memberId } = request.params;
      const { name, description, class: charClass, stats } = request.body;

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        // Verify member exists and belongs to this game
        const member = characterRepo.findById(memberId);
        if (!member) {
          return sendError(reply, 404, 'MEMBER_NOT_FOUND', `Party member not found: ${memberId}`);
        }
        if (member.partyId !== gameId) {
          return sendError(reply, 400, 'INVALID_MEMBER', 'Party member does not belong to this game');
        }

        // Update member
        const updateInput: Parameters<typeof characterRepo.update>[0] = {
          id: memberId,
        };
        if (name !== undefined) updateInput.name = name;
        if (description !== undefined) updateInput.description = description;
        if (charClass !== undefined) updateInput.class = charClass;
        if (stats !== undefined) updateInput.stats = stats;

        characterRepo.update(updateInput);

        // Get updated member
        const updatedMember = characterRepo.findById(memberId);

        return reply.send({ member: updatedMember });
      } catch (error) {
        request.log.error(error, 'Failed to update party member');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to update party member');
      }
    }
  );

  /**
   * DELETE /api/party/:gameId/members/:memberId
   * Remove a party member
   */
  fastify.delete<{ Params: { gameId: string; memberId: string } }>(
    '/:gameId/members/:memberId',
    async (
      request: FastifyRequest<{ Params: { gameId: string; memberId: string } }>,
      reply: FastifyReply
    ) => {
      const { gameId, memberId } = request.params;

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        // Verify member exists and belongs to this game
        const member = characterRepo.findById(memberId);
        if (!member) {
          return sendError(reply, 404, 'MEMBER_NOT_FOUND', `Party member not found: ${memberId}`);
        }
        if (member.partyId !== gameId) {
          return sendError(reply, 400, 'INVALID_MEMBER', 'Party member does not belong to this game');
        }

        // Delete member
        characterRepo.delete(memberId);

        return reply.status(204).send();
      } catch (error) {
        request.log.error(error, 'Failed to delete party member');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to delete party member');
      }
    }
  );

  /**
   * PUT /api/party/:gameId/health
   * Update a party member's health
   */
  fastify.put<{ Params: { gameId: string }; Body: UpdateHealthRequest }>(
    '/:gameId/health',
    { schema: updateHealthSchema },
    async (
      request: FastifyRequest<{ Params: { gameId: string }; Body: UpdateHealthRequest }>,
      reply: FastifyReply
    ) => {
      const { gameId } = request.params;
      const { characterId, health } = request.body;

      try {
        // Verify game exists
        const game = gameRepo.findById(gameId);
        if (!game) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        // Verify member exists and belongs to this game
        const member = characterRepo.findById(characterId);
        if (!member) {
          return sendError(reply, 404, 'MEMBER_NOT_FOUND', `Party member not found: ${characterId}`);
        }
        if (member.partyId !== gameId) {
          return sendError(reply, 400, 'INVALID_MEMBER', 'Party member does not belong to this game');
        }

        // Cap health at maxHealth
        const maxHealth = member.stats.maxHealth;
        const newHealth = Math.min(health, maxHealth);

        // Update health
        characterRepo.update({
          id: characterId,
          stats: {
            ...member.stats,
            health: newHealth,
          },
        });

        // Get updated member
        const updatedMember = characterRepo.findById(characterId);

        return reply.send({ member: updatedMember });
      } catch (error) {
        request.log.error(error, 'Failed to update health');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to update health');
      }
    }
  );
}
