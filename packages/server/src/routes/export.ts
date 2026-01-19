/**
 * Export Routes
 *
 * API endpoints for exporting game state to various formats.
 */

import { FastifyInstance } from 'fastify';
import { getDatabase } from '../db/index.js';
import { JsonExporter } from '../services/export/index.js';

// =============================================================================
// Types
// =============================================================================

interface ExportParams {
  gameId: string;
}

interface ExportQuerystring {
  includeEvents?: string;
  eventLimit?: string;
  includePending?: string;
  includeNotifications?: string;
  compressed?: string;
}

// =============================================================================
// Routes
// =============================================================================

export async function exportRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/export/:gameId/json
   *
   * Export a game to JSON format
   *
   * Query parameters:
   * - includeEvents: boolean (default: true) - Include event history
   * - eventLimit: number (default: null) - Max events to include
   * - includePending: boolean (default: true) - Include pending evolutions
   * - includeNotifications: boolean (default: true) - Include emergence notifications
   * - compressed: boolean (default: false) - gzip compress output
   */
  fastify.get<{
    Params: ExportParams;
    Querystring: ExportQuerystring;
  }>('/:gameId/json', async (request, reply) => {
    const { gameId } = request.params;
    const {
      includeEvents,
      eventLimit,
      includePending,
      includeNotifications,
      compressed,
    } = request.query;

    try {
      const db = getDatabase();
      const exporter = new JsonExporter({ db });

      const result = await exporter.export(gameId, {
        includeEvents: includeEvents !== 'false',
        eventLimit: eventLimit ? parseInt(eventLimit, 10) : null,
        includePending: includePending !== 'false',
        includeNotifications: includeNotifications !== 'false',
        compressed: compressed === 'true',
      });

      // Set response headers
      reply.header('Content-Type', result.contentType);
      reply.header('Content-Disposition', `attachment; filename="${result.filename}"`);

      return reply.send(result.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('not found')) {
        return reply.status(404).send({ error: 'Game not found', gameId });
      }

      request.log.error({ error, gameId }, 'Failed to export game');
      return reply.status(500).send({ error: 'Export failed', message });
    }
  });

  /**
   * GET /api/export/:gameId/json/preview
   *
   * Preview export metadata without downloading the full export
   *
   * Returns export metadata and statistics about what would be exported
   */
  fastify.get<{
    Params: ExportParams;
  }>('/:gameId/json/preview', async (request, reply) => {
    const { gameId } = request.params;

    try {
      const db = getDatabase();

      // Check if game exists
      const gameRow = db.prepare('SELECT id, turn, created_at, updated_at FROM games WHERE id = ?').get(gameId) as {
        id: string;
        turn: number;
        created_at: string;
        updated_at: string;
      } | undefined;

      if (!gameRow) {
        return reply.status(404).send({ error: 'Game not found', gameId });
      }

      // Count various entities
      const eventCount = (db.prepare('SELECT COUNT(*) as count FROM events WHERE game_id = ?').get(gameId) as { count: number }).count;
      const sceneCount = (db.prepare('SELECT COUNT(*) as count FROM scenes WHERE game_id = ?').get(gameId) as { count: number }).count;
      const relationshipCount = (db.prepare('SELECT COUNT(*) as count FROM relationships WHERE game_id = ?').get(gameId) as { count: number }).count;
      const traitCount = (db.prepare('SELECT COUNT(*) as count FROM entity_traits WHERE game_id = ?').get(gameId) as { count: number }).count;
      const pendingEvolutionCount = (db.prepare('SELECT COUNT(*) as count FROM pending_evolutions WHERE game_id = ?').get(gameId) as { count: number }).count;
      const emergenceCount = (db.prepare('SELECT COUNT(*) as count FROM emergence_notifications WHERE game_id = ?').get(gameId) as { count: number }).count;
      const areaCount = (db.prepare('SELECT COUNT(*) as count FROM areas').get() as { count: number }).count;
      const npcCount = (db.prepare('SELECT COUNT(*) as count FROM npcs').get() as { count: number }).count;

      return reply.send({
        gameId,
        turn: gameRow.turn,
        createdAt: gameRow.created_at,
        updatedAt: gameRow.updated_at,
        counts: {
          events: eventCount,
          scenes: sceneCount,
          relationships: relationshipCount,
          traits: traitCount,
          pendingEvolutions: pendingEvolutionCount,
          emergenceNotifications: emergenceCount,
          areas: areaCount,
          npcs: npcCount,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      request.log.error({ error, gameId }, 'Failed to preview export');
      return reply.status(500).send({ error: 'Preview failed', message });
    }
  });
}
