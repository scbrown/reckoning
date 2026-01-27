/**
 * Tests for the Sprite Generator Service
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  SpriteGenerator,
  SpriteGeneratorError,
  getSpriteGenerator,
  generateCharacterSprite,
  type CharacterSpec,
} from '../sprite-generator.js';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LPC_ROOT = join(__dirname, '..', '..', '..', '..', 'assets', 'lpc-layers');

// Check if LPC assets are available (they're large and may not be fetched)
const hasLpcAssets = existsSync(LPC_ROOT) && existsSync(join(LPC_ROOT, 'body'));

describe('SpriteGenerator', () => {
  let generator: SpriteGenerator;

  beforeEach(() => {
    generator = new SpriteGenerator({ maxCacheSize: 10 });
  });

  afterEach(() => {
    generator.clearCache();
  });

  describe('isReady', () => {
    it('should return true if LPC assets directory exists', () => {
      const result = generator.isReady();
      expect(typeof result).toBe('boolean');
      // This will be true or false depending on whether assets are fetched
    });
  });

  describe('getLpcRoot', () => {
    it('should return the LPC root path', () => {
      const root = generator.getLpcRoot();
      expect(root).toContain('lpc-layers');
    });
  });

  describe('listAvailable', () => {
    it('should list available body types', () => {
      const bodies = generator.listAvailable('body');
      expect(Array.isArray(bodies)).toBe(true);
    });

    it('should list available hair styles', () => {
      const hair = generator.listAvailable('hair');
      expect(Array.isArray(hair)).toBe(true);
    });

    it('should return empty array for non-existent category', () => {
      // @ts-expect-error - testing invalid category
      const result = generator.listAvailable('nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      const stats = generator.getCacheStats();
      expect(stats).toEqual({ size: 0, maxSize: 10 });
    });
  });

  describe('clearCache', () => {
    it('should clear the cache', () => {
      generator.clearCache();
      expect(generator.getCacheStats().size).toBe(0);
    });
  });

  describe.skipIf(!hasLpcAssets)('generate (with assets)', () => {
    it('should generate a basic character sprite', async () => {
      const spec: CharacterSpec = {
        body: 'male',
        skinTone: 'medium',
      };

      const result = await generator.generate(spec);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('spec');
      expect(result).toHaveProperty('cacheKey');
      expect(result.data).toBeInstanceOf(Buffer);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should cache generated sprites', async () => {
      const spec: CharacterSpec = {
        body: 'male',
        skinTone: 'light',
      };

      // First generation
      const result1 = await generator.generate(spec);
      expect(generator.getCacheStats().size).toBe(1);

      // Second generation should use cache
      const result2 = await generator.generate(spec);
      expect(result2.cacheKey).toBe(result1.cacheKey);
      expect(generator.getCacheStats().size).toBe(1);
    });

    it('should evict old cache entries when full', async () => {
      const smallCacheGenerator = new SpriteGenerator({ maxCacheSize: 2 });

      // Generate 3 sprites to trigger eviction
      await smallCacheGenerator.generate({ body: 'male', skinTone: 'light' });
      await smallCacheGenerator.generate({ body: 'male', skinTone: 'medium' });
      await smallCacheGenerator.generate({ body: 'male', skinTone: 'dark' });

      expect(smallCacheGenerator.getCacheStats().size).toBeLessThanOrEqual(2);
    });
  });

  describe('generate (error handling)', () => {
    it('should throw SpriteGeneratorError for missing body layer', async () => {
      const spec: CharacterSpec = {
        body: 'male',
        skinTone: 'nonexistent' as any,
      };

      await expect(generator.generate(spec)).rejects.toThrow(SpriteGeneratorError);
    });

    it('should include spec in error', async () => {
      const spec: CharacterSpec = {
        body: 'nonexistent' as any,
        skinTone: 'light',
      };

      try {
        await generator.generate(spec);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SpriteGeneratorError);
        expect((error as SpriteGeneratorError).spec).toEqual(spec);
      }
    });
  });

  describe('getSpriteGenerator', () => {
    it('should return a singleton instance', () => {
      const gen1 = getSpriteGenerator();
      const gen2 = getSpriteGenerator();
      expect(gen1).toBe(gen2);
    });
  });

  describe('generateCharacterSprite', () => {
    it.skipIf(!hasLpcAssets)('should generate a sprite buffer', async () => {
      const buffer = await generateCharacterSprite({
        body: 'male',
        skinTone: 'medium',
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});

describe('SpriteGeneratorError', () => {
  it('should have correct name', () => {
    const error = new SpriteGeneratorError('test error');
    expect(error.name).toBe('SpriteGeneratorError');
  });

  it('should include spec and missingLayer', () => {
    const spec: CharacterSpec = { body: 'male', skinTone: 'light' };
    const error = new SpriteGeneratorError('test error', spec, 'body/male/light');

    expect(error.spec).toEqual(spec);
    expect(error.missingLayer).toBe('body/male/light');
  });
});
