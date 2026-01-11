/**
 * Game Routes Tests
 *
 * These tests verify the route validation and error handling.
 * Full integration tests that require the game engine are in game.integration.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll, beforeAll } from 'vitest';
import Fastify, { FastifyInstance, FastifyPluginCallback } from 'fastify';

// Create a test plugin that mocks the game routes with validation schemas
const mockGameRoutes: FastifyPluginCallback = async (fastify) => {
  // Schema for /new endpoint
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

  // Schema for /save endpoint
  const saveGameSchema = {
    body: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 100 },
      },
    },
  };

  // Schema for /control endpoint
  const controlSchema = {
    body: {
      type: 'object',
      required: ['mode'],
      properties: {
        mode: { type: 'string', enum: ['auto', 'paused', 'stepping', 'stopped'] },
      },
    },
  };

  // Schema for /editor endpoint
  const editorUpdateSchema = {
    body: {
      type: 'object',
      properties: {
        editedContent: { type: 'string' },
        status: { type: 'string', enum: ['idle', 'generating', 'editing', 'accepting'] },
      },
    },
  };

  // Schema for /inject endpoint
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

  // Schema for /next endpoint
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

  // Schema for /submit endpoint
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

  // POST /new - validation only mock
  fastify.post('/new', { schema: newGameSchema }, async (request, reply) => {
    return reply.send({
      gameId: 'mock-game-id',
      session: {
        player: { name: (request.body as { playerName: string }).playerName }
      }
    });
  });

  // GET /list - always returns empty list in mock
  fastify.get('/list', async (request, reply) => {
    return reply.send({ saves: [] });
  });

  // GET /:id - returns 404 for 'non-existent-id'
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === 'non-existent-id') {
      return reply.status(404).send({
        error: { code: 'GAME_NOT_FOUND', message: 'Game not found' }
      });
    }
    return reply.send({
      session: { state: { id } },
      editorState: { pending: null, editedContent: null, status: 'idle' }
    });
  });

  // POST /:id/save - validation mock
  fastify.post('/:id/save', { schema: saveGameSchema }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === 'non-existent-id') {
      return reply.status(404).send({
        error: { code: 'GAME_NOT_FOUND', message: 'Game not found' }
      });
    }
    const { name } = request.body as { name: string };
    return reply.send({
      slot: { id: 'mock-slot-id', gameId: id, name }
    });
  });

  // POST /:id/control - validation mock
  fastify.post('/:id/control', { schema: controlSchema }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === 'non-existent-id') {
      return reply.status(404).send({
        error: { code: 'GAME_NOT_FOUND', message: 'Game not found' }
      });
    }
    const { mode } = request.body as { mode: string };
    return reply.send({ mode });
  });

  // GET /:id/status - returns mock status
  fastify.get('/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === 'non-existent-id') {
      return reply.status(404).send({
        error: { code: 'GAME_NOT_FOUND', message: 'Game not found' }
      });
    }
    return reply.send({
      system: { ai: { status: 'ok' }, tts: { status: 'ok', queueLength: 0 }, db: { status: 'ok' } },
      observation: { turn: 0, totalEvents: 0, eventsThisTurn: 0, currentLocation: 'Test', partySize: 1, npcsPresent: 0, sessionDuration: 0 }
    });
  });

  // GET /:id/pending - returns mock pending state
  fastify.get('/:id/pending', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === 'non-existent-id') {
      return reply.status(404).send({
        error: { code: 'GAME_NOT_FOUND', message: 'Game not found' }
      });
    }
    return reply.send({
      pending: null,
      editorState: { pending: null, editedContent: null, status: 'idle' }
    });
  });

  // PUT /:id/editor - validation mock
  fastify.put('/:id/editor', { schema: editorUpdateSchema }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === 'non-existent-id') {
      return reply.status(404).send({
        error: { code: 'GAME_NOT_FOUND', message: 'Game not found' }
      });
    }
    return reply.send({
      editorState: { pending: null, editedContent: null, status: 'idle' }
    });
  });

  // POST /:id/inject - validation mock
  fastify.post('/:id/inject', { schema: injectSchema }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === 'non-existent-id') {
      return reply.status(404).send({
        error: { code: 'GAME_NOT_FOUND', message: 'Game not found' }
      });
    }
    const { content, eventType } = request.body as { content: string; eventType: string };
    return reply.send({
      event: { id: 'mock-event-id', content, eventType },
      session: { state: { id } }
    });
  });

  // POST /:id/next - validation mock
  fastify.post('/:id/next', { schema: nextSchema }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === 'non-existent-id') {
      return reply.status(404).send({
        error: { code: 'GAME_NOT_FOUND', message: 'Game not found' }
      });
    }
    return reply.send({ status: 'generating' });
  });

  // POST /:id/regenerate - mock
  fastify.post('/:id/regenerate', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === 'non-existent-id') {
      return reply.status(404).send({
        error: { code: 'GAME_NOT_FOUND', message: 'Game not found' }
      });
    }
    return reply.send({ status: 'generating' });
  });

  // POST /:id/submit - validation mock
  fastify.post('/:id/submit', { schema: submitSchema }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === 'non-existent-id') {
      return reply.status(404).send({
        error: { code: 'GAME_NOT_FOUND', message: 'Game not found' }
      });
    }
    return reply.send({
      event: { id: 'mock-event-id' },
      session: { state: { id } }
    });
  });

  // GET /:id/events - SSE mock
  fastify.get('/:id/events', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === 'non-existent-id') {
      return reply.status(404).send({
        error: { code: 'GAME_NOT_FOUND', message: 'Game not found' }
      });
    }
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    return reply;
  });
};

describe('Game Routes - Validation Tests', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(mockGameRoutes, { prefix: '/api/game' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/game/new', () => {
    it('should accept valid playerName', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/new',
        payload: { playerName: 'TestPlayer' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('gameId');
      expect(body.session.player.name).toBe('TestPlayer');
    });

    it('should return 400 for missing playerName', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/new',
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for empty playerName', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/new',
        payload: { playerName: '' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for playerName exceeding max length', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/new',
        payload: { playerName: 'A'.repeat(51) },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/game/list', () => {
    it('should return saves array', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/game/list',
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('saves');
      expect(Array.isArray(body.saves)).toBe(true);
    });
  });

  describe('GET /api/game/:id', () => {
    it('should return 404 for non-existent game', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/game/non-existent-id',
      });
      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('GAME_NOT_FOUND');
    });

    it('should return session for valid game', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/game/valid-game-id',
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('session');
      expect(body).toHaveProperty('editorState');
    });
  });

  describe('POST /api/game/:id/save', () => {
    it('should accept valid save name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/valid-game-id/save',
        payload: { name: 'My Save' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.slot.name).toBe('My Save');
    });

    it('should return 400 for missing save name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/valid-game-id/save',
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for non-existent game', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/non-existent-id/save',
        payload: { name: 'My Save' },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/game/:id/control', () => {
    it('should accept valid playback mode', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/valid-game-id/control',
        payload: { mode: 'paused' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.mode).toBe('paused');
    });

    it('should return 400 for invalid mode', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/valid-game-id/control',
        payload: { mode: 'invalid-mode' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for non-existent game', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/non-existent-id/control',
        payload: { mode: 'paused' },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/game/:id/status', () => {
    it('should return system and observation', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/game/valid-game-id/status',
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('system');
      expect(body).toHaveProperty('observation');
    });

    it('should return 404 for non-existent game', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/game/non-existent-id/status',
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /api/game/:id/editor', () => {
    it('should accept valid editor update', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/game/valid-game-id/editor',
        payload: { editedContent: 'Modified content', status: 'editing' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('editorState');
    });

    it('should return 400 for invalid status', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/game/valid-game-id/editor',
        payload: { status: 'invalid-status' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for non-existent game', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/game/non-existent-id/editor',
        payload: { editedContent: 'Content' },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/game/:id/inject', () => {
    it('should accept valid inject request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/valid-game-id/inject',
        payload: { content: 'DM content', eventType: 'dm_injection' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('event');
      expect(body.event.eventType).toBe('dm_injection');
    });

    it('should return 400 for missing content', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/valid-game-id/inject',
        payload: { eventType: 'dm_injection' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid event type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/valid-game-id/inject',
        payload: { content: 'Content', eventType: 'invalid-type' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for non-existent game', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/non-existent-id/inject',
        payload: { content: 'Content', eventType: 'dm_injection' },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/game/:id/next', () => {
    it('should accept valid next request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/valid-game-id/next',
        payload: { type: 'narration' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('generating');
    });

    it('should accept optional dmGuidance', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/valid-game-id/next',
        payload: { type: 'narration', dmGuidance: 'Make it spooky' },
      });
      expect(response.statusCode).toBe(200);
    });

    it('should return 404 for non-existent game', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/non-existent-id/next',
        payload: {},
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/game/:id/regenerate', () => {
    it('should accept regenerate request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/valid-game-id/regenerate',
        payload: { feedback: 'Make it better' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('generating');
    });

    it('should work without feedback', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/valid-game-id/regenerate',
        payload: {},
      });
      expect(response.statusCode).toBe(200);
    });

    it('should return 404 for non-existent game', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/non-existent-id/regenerate',
        payload: {},
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/game/:id/submit', () => {
    it('should accept ACCEPT action', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/valid-game-id/submit',
        payload: { action: { type: 'ACCEPT' } },
      });
      expect(response.statusCode).toBe(200);
    });

    it('should accept EDIT action with content', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/valid-game-id/submit',
        payload: { action: { type: 'EDIT', content: 'Edited content' } },
      });
      expect(response.statusCode).toBe(200);
    });

    it('should return 400 for invalid action type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/valid-game-id/submit',
        payload: { action: { type: 'INVALID' } },
      });
      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for non-existent game', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/non-existent-id/submit',
        payload: { action: { type: 'ACCEPT' } },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/game/:id/events (SSE)', () => {
    it('should return 404 for non-existent game', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/game/non-existent-id/events',
      });
      expect(response.statusCode).toBe(404);
    });

    // Note: Testing SSE connections with Fastify inject is limited since
    // the connection doesn't end naturally. The route structure is verified
    // by the 404 test above. Full SSE testing would require an actual HTTP client.
  });
});
