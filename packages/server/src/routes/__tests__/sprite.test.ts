/**
 * Tests for Sprite Asset Routes
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import { spriteRoutes } from '../sprite.js';
import { existsSync, readFileSync } from 'fs';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

// Mock the services
vi.mock('../../services/index.js', () => ({
  SpriteGenerator: vi.fn().mockImplementation(() => ({
    isReady: vi.fn().mockReturnValue(true),
    generate: vi.fn().mockResolvedValue({
      data: Buffer.from('fake-png-data'),
      cacheKey: 'test-cache-key',
    }),
  })),
  ArchetypeMatcher: vi.fn().mockImplementation(() => ({
    loadManifest: vi.fn().mockResolvedValue(undefined),
    isReady: vi.fn().mockReturnValue(true),
    getCount: vi.fn().mockReturnValue(5),
    getById: vi.fn().mockReturnValue({
      id: 'test-sprite',
      race: 'human',
      gender: 'male',
      archetype: 'warrior',
      tags: ['combat'],
      mood: 'determined',
    }),
    findBestMatch: vi.fn().mockReturnValue([
      {
        archetype: {
          id: 'human-male-warrior-light-short',
          race: 'human',
          gender: 'male',
          archetype: 'warrior',
          tags: ['combat', 'melee'],
          mood: 'determined',
        },
        score: 85,
      },
    ]),
    getUniqueValues: vi.fn().mockImplementation((field) => {
      if (field === 'race') return ['human', 'elf', 'dwarf'];
      if (field === 'gender') return ['male', 'female'];
      if (field === 'archetype') return ['warrior', 'mage', 'rogue'];
      return [];
    }),
  })),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

describe('Sprite Routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify();
    await app.register(spriteRoutes, { prefix: '/api/assets' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/assets/sprite/:id', () => {
    it('should return sprite when found', async () => {
      const fakePngData = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG header
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(fakePngData);

      const response = await app.inject({
        method: 'GET',
        url: '/api/assets/sprite/test-sprite',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/png');
      expect(response.headers['cache-control']).toContain('public');
    });

    it('should return 404 for missing sprite', async () => {
      mockExistsSync.mockReturnValue(false);

      const response = await app.inject({
        method: 'GET',
        url: '/api/assets/sprite/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('SPRITE_NOT_FOUND');
    });

    it('should accept palette query parameter', async () => {
      const fakePngData = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(fakePngData);

      const response = await app.inject({
        method: 'GET',
        url: '/api/assets/sprite/test-sprite?palette=cool_villain',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid palette preset', async () => {
      mockExistsSync.mockReturnValue(true);

      const response = await app.inject({
        method: 'GET',
        url: '/api/assets/sprite/test-sprite?palette=invalid_preset',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/assets/sprite/generate', () => {
    it('should generate sprite from spec', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/assets/sprite/generate',
        payload: {
          body: 'male',
          skinTone: 'medium',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/png');
      expect(response.headers['x-cache-key']).toBeDefined();
    });

    it('should accept full character spec', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/assets/sprite/generate',
        payload: {
          body: 'female',
          skinTone: 'dark',
          hair: { style: 'long', color: 'black' },
          armor: { type: 'plate' },
          weapon: 'sword',
          accessories: ['shield'],
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid body type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/assets/sprite/generate',
        payload: {
          body: 'invalid',
          skinTone: 'medium',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid skin tone', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/assets/sprite/generate',
        payload: {
          body: 'male',
          skinTone: 'invalid',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/assets/sprite/search', () => {
    it('should search archetypes with no filters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/assets/sprite/search',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.matches).toBeDefined();
      expect(Array.isArray(body.matches)).toBe(true);
    });

    it('should search with race filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/assets/sprite/search?race=human',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should search with multiple filters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/assets/sprite/search?race=elf&gender=female&archetype=mage',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should search with tags', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/assets/sprite/search?tags=combat,hero',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should respect limit parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/assets/sprite/search?limit=3',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/assets/sprite/metadata', () => {
    it('should return library metadata', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/assets/sprite/metadata',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ready).toBeDefined();
      expect(body.totalSprites).toBeDefined();
      expect(body.races).toBeDefined();
      expect(body.genders).toBeDefined();
      expect(body.archetypes).toBeDefined();
      expect(body.palettePresets).toBeDefined();
    });
  });
});
