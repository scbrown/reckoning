/**
 * View Routes
 *
 * API endpoints for display-only views (party, player, DM).
 * These routes return filtered game state appropriate for each view type.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../db/index.js';
import {
  GameRepository,
  CharacterRepository,
  AreaRepository,
  EventRepository,
  SceneRepository,
} from '../db/repositories/index.js';
import { GameStateFilterService, type FullGameState } from '../services/view-filter/index.js';

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

export async function viewRoutes(fastify: FastifyInstance) {
  const db = getDatabase();
  const gameRepo = new GameRepository(db);
  const characterRepo = new CharacterRepository(db);
  const areaRepo = new AreaRepository(db);
  const sceneRepo = new SceneRepository(db);
  const eventRepo = new EventRepository(db);
  const filterService = new GameStateFilterService(db);

  /**
   * Build full game state from repositories
   * Note: For party view, we only need characters, area, scene, and narration.
   * Other fields (traits, relationships, etc.) are not used by party view filter.
   */
  function buildFullGameState(gameId: string): FullGameState | null {
    const game = gameRepo.findById(gameId);
    if (!game) return null;

    // Get characters (party members)
    const characters = characterRepo.findByParty(gameId);

    // Get current area
    const currentArea = game.currentAreaId ? areaRepo.findById(game.currentAreaId) : null;

    // Get current active scene
    const activeScenes = sceneRepo.findActiveByGame(gameId);
    const currentScene = activeScenes.length > 0 ? activeScenes[0] : null;

    // Get recent narration (last 20 events)
    const recentEvents = eventRepo.getRecentContext(gameId, 20);
    const recentNarration = recentEvents
      .filter(e => e.eventType === 'narration' || e.eventType === 'party_dialogue' || e.eventType === 'npc_dialogue')
      .map(e => e.speaker ? `${e.speaker}: ${e.content}` : e.content);

    return {
      game: {
        id: game.id,
        playerId: game.playerId,
        currentAreaId: game.currentAreaId,
        turn: game.turn,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt,
      },
      party: {
        id: gameId,
        gameId,
        members: characters,
      },
      characters,
      currentArea,
      npcs: [], // NPCs not needed for party view
      traits: [], // Traits not needed for party view
      relationships: [], // Relationships not needed for party view
      perceivedRelationships: [], // Not needed for party view
      pendingEvolutions: [], // Not needed for party view
      currentScene,
      recentNarration,
    };
  }

  /**
   * GET /api/view/:gameId/party
   * Get filtered state for party display view
   *
   * Returns narration, avatars, scene, and area info only.
   * No controls, no hidden data, no editing interfaces.
   */
  fastify.get<{ Params: { gameId: string } }>(
    '/:gameId/party',
    async (request: FastifyRequest<{ Params: { gameId: string } }>, reply: FastifyReply) => {
      const { gameId } = request.params;

      try {
        const fullState = buildFullGameState(gameId);
        if (!fullState) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        const partyViewState = filterService.filterGameStateForView(fullState, 'party');

        return reply.send(partyViewState);
      } catch (error) {
        request.log.error(error, 'Failed to get party view state');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to get party view state');
      }
    }
  );

  /**
   * GET /api/view/:gameId/dm
   * Get full state for DM view
   *
   * Returns everything - full visibility.
   */
  fastify.get<{ Params: { gameId: string } }>(
    '/:gameId/dm',
    async (request: FastifyRequest<{ Params: { gameId: string } }>, reply: FastifyReply) => {
      const { gameId } = request.params;

      try {
        const fullState = buildFullGameState(gameId);
        if (!fullState) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        const dmViewState = filterService.filterGameStateForView(fullState, 'dm');

        return reply.send(dmViewState);
      } catch (error) {
        request.log.error(error, 'Failed to get DM view state');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to get DM view state');
      }
    }
  );

  /**
   * GET /api/view/:gameId/player/:characterId
   * Get filtered state for player view
   *
   * Returns character's perspective with filtered/perceived data.
   */
  fastify.get<{ Params: { gameId: string; characterId: string } }>(
    '/:gameId/player/:characterId',
    async (
      request: FastifyRequest<{ Params: { gameId: string; characterId: string } }>,
      reply: FastifyReply
    ) => {
      const { gameId, characterId } = request.params;

      try {
        const fullState = buildFullGameState(gameId);
        if (!fullState) {
          return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
        }

        // Verify character exists and belongs to this game
        const character = fullState.characters.find(c => c.id === characterId);
        if (!character) {
          return sendError(reply, 404, 'CHARACTER_NOT_FOUND', `Character not found: ${characterId}`);
        }

        const playerViewState = filterService.filterGameStateForView(fullState, 'player', characterId);

        return reply.send(playerViewState);
      } catch (error) {
        request.log.error(error, 'Failed to get player view state');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Failed to get player view state');
      }
    }
  );
}
