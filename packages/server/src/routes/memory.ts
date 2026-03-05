/**
 * Memory Journal Routes
 *
 * API endpoints for the Unreliable Self memory journal system.
 * Provides DM dashboard access to character memories and distortion controls.
 */

import { FastifyInstance, type FastifyReply } from 'fastify';
import { getDatabase } from '../db/index.js';
import { MemoryJournalRepository } from '../db/repositories/memory-journal-repository.js';
import { EventRepository, GameRepository } from '../db/repositories/index.js';
import { PatternObserver } from '../services/chronicle/pattern-observer.js';
import { DistortionEngine } from '../services/memory/memory-journal.js';

interface MemoryParams {
  gameId: string;
  characterId: string;
}

interface MemoryIdParams {
  id: string;
}

interface AnalyzeParams {
  gameId: string;
  characterId: string;
  eventId: string;
}

function sendError(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.status(status).send({ error: { code, message } });
}

export default async function memoryRoutes(fastify: FastifyInstance) {
  const db = getDatabase();
  const memoryRepo = new MemoryJournalRepository(db);
  const gameRepo = new GameRepository(db);
  const eventRepo = new EventRepository(db);
  const patternObserver = new PatternObserver(eventRepo);

  /**
   * GET /api/memory/:gameId/:characterId
   * Get all memory journal entries for a character
   */
  fastify.get<{ Params: MemoryParams; Querystring: { limit?: string } }>(
    '/:gameId/:characterId',
    async (request, reply) => {
      const { gameId, characterId } = request.params;
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : undefined;

      const game = gameRepo.findById(gameId);
      if (!game) {
        return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
      }

      const entries = memoryRepo.findByCharacter(gameId, characterId, limit);
      return reply.send({ entries });
    }
  );

  /**
   * GET /api/memory/analyze/:gameId/:characterId/:eventId
   * Analyze how a character would remember a specific event (preview distortion)
   */
  fastify.get<{ Params: AnalyzeParams }>(
    '/analyze/:gameId/:characterId/:eventId',
    async (request, reply) => {
      const { gameId, characterId, eventId } = request.params;

      const game = gameRepo.findById(gameId);
      if (!game) {
        return sendError(reply, 404, 'GAME_NOT_FOUND', `Game not found: ${gameId}`);
      }

      // Get the canonical event
      const events = eventRepo.findByActor(gameId, 'player', characterId, { limit: 1000 });
      const event = events.find(e => e.id === eventId);
      if (!event) {
        return sendError(reply, 404, 'EVENT_NOT_FOUND', `Event not found: ${eventId}`);
      }

      // Get character psychology
      const patterns = patternObserver.getPlayerPatterns(gameId, characterId);
      const psychology = {
        traits: patterns.dominantTraits,
        patterns,
      };

      const engine = new DistortionEngine();
      const analysis = engine.analyzeEvent(event, psychology);

      return reply.send({
        event: {
          id: event.id,
          content: event.content,
          action: event.action,
          turn: event.turn,
        },
        analysis,
      });
    }
  );

  /**
   * POST /api/memory/:id/approve
   * DM approves a memory entry
   */
  fastify.post<{ Params: MemoryIdParams }>(
    '/:id/approve',
    async (request, reply) => {
      const entry = memoryRepo.approve(request.params.id);
      if (!entry) {
        return sendError(reply, 404, 'MEMORY_NOT_FOUND', `Memory entry not found: ${request.params.id}`);
      }
      return reply.send({ entry });
    }
  );

  /**
   * POST /api/memory/:id/override
   * DM overrides a memory entry with custom text
   */
  fastify.post<{ Params: MemoryIdParams; Body: { content: string } }>(
    '/:id/override',
    async (request, reply) => {
      const { content } = request.body as { content: string };
      if (!content || typeof content !== 'string') {
        return sendError(reply, 400, 'INVALID_INPUT', 'Content is required');
      }

      const entry = memoryRepo.setDmOverride(request.params.id, content);
      if (!entry) {
        return sendError(reply, 404, 'MEMORY_NOT_FOUND', `Memory entry not found: ${request.params.id}`);
      }
      return reply.send({ entry });
    }
  );

  /**
   * DELETE /api/memory/:id
   * Delete a memory entry
   */
  fastify.delete<{ Params: MemoryIdParams }>(
    '/:id',
    async (request, reply) => {
      memoryRepo.delete(request.params.id);
      return reply.send({ ok: true });
    }
  );
}
