/**
 * Chronicle Routes Tests
 *
 * Tests for the structured events API endpoints.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// Mock the database before importing routes
vi.mock('../../db/index.js', () => ({
  getDatabase: vi.fn(() => ({})),
}));

// Mock repositories
const mockEventRepo = {
  findByActions: vi.fn(),
  countByActions: vi.fn(),
  findByActor: vi.fn(),
  findByTarget: vi.fn(),
  getActionSummary: vi.fn(),
};

const mockGameRepo = {
  findById: vi.fn(),
};

const mockPatternObserver = {
  getPlayerPatterns: vi.fn(),
};

vi.mock('../../db/repositories/index.js', () => ({
  EventRepository: vi.fn(() => mockEventRepo),
  GameRepository: vi.fn(() => mockGameRepo),
}));

vi.mock('../../services/chronicle/pattern-observer.js', () => ({
  PatternObserver: vi.fn(() => mockPatternObserver),
}));

import { chronicleRoutes } from '../chronicle.js';

describe('Chronicle Routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify();
    await server.register(chronicleRoutes, { prefix: '/api/chronicle' });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/chronicle/events/by-action', () => {
    it('should return 404 for non-existent game', async () => {
      mockGameRepo.findById.mockReturnValue(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/events/by-action',
        query: {
          gameId: '550e8400-e29b-41d4-a716-446655440000',
          actions: 'attack_first,kill',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload)).toEqual({
        error: {
          code: 'GAME_NOT_FOUND',
          message: 'Game not found: 550e8400-e29b-41d4-a716-446655440000',
        },
      });
    });

    it('should return 400 for invalid actions', async () => {
      mockGameRepo.findById.mockReturnValue({ id: '550e8400-e29b-41d4-a716-446655440000' });

      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/events/by-action',
        query: {
          gameId: '550e8400-e29b-41d4-a716-446655440000',
          actions: 'invalid_action,another_bad_one',
        },
      });

      expect(response.statusCode).toBe(400);
      const payload = JSON.parse(response.payload);
      expect(payload.error.code).toBe('INVALID_ACTIONS');
    });

    it('should return events with pagination for valid request', async () => {
      mockGameRepo.findById.mockReturnValue({ id: '550e8400-e29b-41d4-a716-446655440000' });
      mockEventRepo.findByActions.mockReturnValue([
        { id: 'event-1', action: 'attack_first', content: 'Test event' },
      ]);
      mockEventRepo.countByActions.mockReturnValue(1);

      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/events/by-action',
        query: {
          gameId: '550e8400-e29b-41d4-a716-446655440000',
          actions: 'attack_first',
          limit: '10',
          offset: '0',
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.events).toHaveLength(1);
      expect(payload.pagination).toEqual({
        limit: 10,
        offset: 0,
        total: 1,
        hasMore: false,
      });
    });

    it('should require gameId parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/events/by-action',
        query: {
          actions: 'attack_first',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require actions parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/events/by-action',
        query: {
          gameId: '550e8400-e29b-41d4-a716-446655440000',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/chronicle/events/by-actor', () => {
    it('should return 404 for non-existent game', async () => {
      mockGameRepo.findById.mockReturnValue(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/events/by-actor',
        query: {
          gameId: '550e8400-e29b-41d4-a716-446655440000',
          actorType: 'player',
          actorId: 'player-1',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return events with pagination for valid request', async () => {
      mockGameRepo.findById.mockReturnValue({ id: '550e8400-e29b-41d4-a716-446655440000' });
      mockEventRepo.findByActor.mockReturnValue([
        { id: 'event-1', actorType: 'player', actorId: 'player-1', content: 'Test event' },
      ]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/events/by-actor',
        query: {
          gameId: '550e8400-e29b-41d4-a716-446655440000',
          actorType: 'player',
          actorId: 'player-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.events).toHaveLength(1);
      expect(payload.pagination).toBeDefined();
    });

    it('should validate actorType enum', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/events/by-actor',
        query: {
          gameId: '550e8400-e29b-41d4-a716-446655440000',
          actorType: 'invalid_type',
          actorId: 'player-1',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/chronicle/events/by-target', () => {
    it('should return 404 for non-existent game', async () => {
      mockGameRepo.findById.mockReturnValue(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/events/by-target',
        query: {
          gameId: '550e8400-e29b-41d4-a716-446655440000',
          targetType: 'npc',
          targetId: 'npc-1',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return events with pagination for valid request', async () => {
      mockGameRepo.findById.mockReturnValue({ id: '550e8400-e29b-41d4-a716-446655440000' });
      mockEventRepo.findByTarget.mockReturnValue([
        { id: 'event-1', targetType: 'npc', targetId: 'npc-1', content: 'Test event' },
      ]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/events/by-target',
        query: {
          gameId: '550e8400-e29b-41d4-a716-446655440000',
          targetType: 'npc',
          targetId: 'npc-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.events).toHaveLength(1);
      expect(payload.pagination).toBeDefined();
    });

    it('should validate targetType enum', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/events/by-target',
        query: {
          gameId: '550e8400-e29b-41d4-a716-446655440000',
          targetType: 'invalid_type',
          targetId: 'npc-1',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/chronicle/patterns/:gameId/:playerId', () => {
    it('should return 404 for non-existent game', async () => {
      mockGameRepo.findById.mockReturnValue(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/patterns/550e8400-e29b-41d4-a716-446655440000/player-1',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return player patterns for valid request', async () => {
      mockGameRepo.findById.mockReturnValue({ id: '550e8400-e29b-41d4-a716-446655440000' });
      mockPatternObserver.getPlayerPatterns.mockReturnValue({
        playerId: 'player-1',
        gameId: '550e8400-e29b-41d4-a716-446655440000',
        totalEvents: 10,
        categoryCounts: { mercy: 2, violence: 3, honesty: 1, social: 2, exploration: 1, character: 1 },
        ratios: { mercyVsViolence: -0.2, honestyVsDeception: 0.5, helpfulVsHarmful: 0.3 },
        violenceInitiation: { initiatesViolence: true, initiationRatio: 0.5, totalViolenceEvents: 3, attackFirstEvents: 2 },
        socialApproach: 'balanced',
        dominantTraits: ['aggressive'],
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/patterns/550e8400-e29b-41d4-a716-446655440000/player-1',
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.patterns).toBeDefined();
      expect(payload.patterns.playerId).toBe('player-1');
      expect(payload.patterns.dominantTraits).toContain('aggressive');
    });

    it('should accept optional turn range parameters', async () => {
      mockGameRepo.findById.mockReturnValue({ id: '550e8400-e29b-41d4-a716-446655440000' });
      mockPatternObserver.getPlayerPatterns.mockReturnValue({
        playerId: 'player-1',
        gameId: '550e8400-e29b-41d4-a716-446655440000',
        totalEvents: 5,
        categoryCounts: { mercy: 1, violence: 1, honesty: 1, social: 1, exploration: 1, character: 0 },
        ratios: { mercyVsViolence: 0, honestyVsDeception: 0, helpfulVsHarmful: 0 },
        violenceInitiation: { initiatesViolence: false, initiationRatio: 0, totalViolenceEvents: 1, attackFirstEvents: 0 },
        socialApproach: 'balanced',
        dominantTraits: [],
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/patterns/550e8400-e29b-41d4-a716-446655440000/player-1',
        query: {
          turnStart: '1',
          turnEnd: '10',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockPatternObserver.getPlayerPatterns).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'player-1',
        { turnRange: { start: 1, end: 10 } }
      );
    });
  });

  describe('GET /api/chronicle/emergence/:gameId/:playerId', () => {
    it('should return 404 for non-existent game', async () => {
      mockGameRepo.findById.mockReturnValue(null);

      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/emergence/550e8400-e29b-41d4-a716-446655440000/player-1',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return emergence data for valid request', async () => {
      mockGameRepo.findById.mockReturnValue({ id: '550e8400-e29b-41d4-a716-446655440000' });
      mockEventRepo.getActionSummary.mockReturnValue(new Map([
        ['attack_first', 5],
        ['kill', 3],
        ['spare_enemy', 2],
      ]));
      mockPatternObserver.getPlayerPatterns.mockReturnValue({
        playerId: 'player-1',
        gameId: '550e8400-e29b-41d4-a716-446655440000',
        totalEvents: 10,
        categoryCounts: { mercy: 2, violence: 8, honesty: 0, social: 0, exploration: 0, character: 0 },
        ratios: { mercyVsViolence: -0.6, honestyVsDeception: 0, helpfulVsHarmful: 0 },
        violenceInitiation: { initiatesViolence: true, initiationRatio: 0.625, totalViolenceEvents: 8, attackFirstEvents: 5 },
        socialApproach: 'minimal',
        dominantTraits: ['ruthless', 'aggressive'],
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/emergence/550e8400-e29b-41d4-a716-446655440000/player-1',
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.emergence).toBeDefined();
      expect(payload.emergence.actionCounts).toEqual({
        attack_first: 5,
        kill: 3,
        spare_enemy: 2,
      });
      expect(payload.emergence.totalActions).toBe(10);
      expect(payload.emergence.emergentTraits).toContain('ruthless');
      expect(payload.emergence.behavioralProfile.initiatesViolence).toBe(true);
    });
  });

  describe('GET /api/chronicle/actions', () => {
    it('should return list of valid actions and categories', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/chronicle/actions',
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.actions).toBeDefined();
      expect(Array.isArray(payload.actions)).toBe(true);
      expect(payload.actions).toContain('attack_first');
      expect(payload.actions).toContain('spare_enemy');
      expect(payload.categories).toBeDefined();
      expect(payload.categories.violence).toContain('attack_first');
      expect(payload.categories.mercy).toContain('spare_enemy');
    });
  });
});
