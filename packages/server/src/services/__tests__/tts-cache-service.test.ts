import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { TTSCacheService } from '../cache/tts-cache-service.js';
import type { VoiceSettings } from '@reckoning/shared';

// Mock ioredis
vi.mock('ioredis', () => {
  const mockRedis = {
    connect: vi.fn().mockResolvedValue(undefined),
    getBuffer: vi.fn(),
    setex: vi.fn().mockResolvedValue('OK'),
    quit: vi.fn().mockResolvedValue('OK'),
    on: vi.fn(),
  };
  return {
    default: vi.fn(() => mockRedis),
  };
});

describe('TTSCacheService', () => {
  let cacheService: TTSCacheService;
  let mockRedis: {
    connect: ReturnType<typeof vi.fn>;
    getBuffer: ReturnType<typeof vi.fn>;
    setex: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import the mocked Redis
    const Redis = (await import('ioredis')).default;
    cacheService = new TTSCacheService('redis://localhost:6379');
    mockRedis = Redis.mock.results[Redis.mock.results.length - 1].value;

    // Simulate connection event
    const connectCallback = mockRedis.on.mock.calls.find(
      (call: [string, () => void]) => call[0] === 'connect'
    )?.[1];
    if (connectCallback) connectCallback();
  });

  afterEach(async () => {
    await cacheService.close();
  });

  describe('generateKey', () => {
    it('should generate a consistent cache key for same parameters', () => {
      const params = {
        text: 'Hello world',
        voiceId: 'voice-123',
      };

      const key1 = cacheService.generateKey(params);
      const key2 = cacheService.generateKey(params);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^tts:[a-f0-9]{64}$/);
    });

    it('should generate different keys for different text', () => {
      const key1 = cacheService.generateKey({
        text: 'Hello world',
        voiceId: 'voice-123',
      });
      const key2 = cacheService.generateKey({
        text: 'Goodbye world',
        voiceId: 'voice-123',
      });

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different voice IDs', () => {
      const key1 = cacheService.generateKey({
        text: 'Hello world',
        voiceId: 'voice-123',
      });
      const key2 = cacheService.generateKey({
        text: 'Hello world',
        voiceId: 'voice-456',
      });

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different settings', () => {
      const key1 = cacheService.generateKey({
        text: 'Hello world',
        voiceId: 'voice-123',
        settings: { stability: 0.5 },
      });
      const key2 = cacheService.generateKey({
        text: 'Hello world',
        voiceId: 'voice-123',
        settings: { stability: 0.7 },
      });

      expect(key1).not.toBe(key2);
    });

    it('should normalize settings by only including defined properties', () => {
      const settings1: Partial<VoiceSettings> = {
        stability: 0.5,
        similarityBoost: 0.8,
      };
      const settings2: Partial<VoiceSettings> = {
        stability: 0.5,
        similarityBoost: 0.8,
        style: undefined,
        useSpeakerBoost: undefined,
      };

      const key1 = cacheService.generateKey({
        text: 'Hello world',
        voiceId: 'voice-123',
        settings: settings1,
      });
      const key2 = cacheService.generateKey({
        text: 'Hello world',
        voiceId: 'voice-123',
        settings: settings2,
      });

      // Keys should be the same because undefined values are not included
      expect(key1).toBe(key2);
    });

    it('should include all defined settings properties in key generation', () => {
      const fullSettings: Partial<VoiceSettings> = {
        stability: 0.5,
        similarityBoost: 0.8,
        style: 0.3,
        useSpeakerBoost: true,
      };

      const partialSettings: Partial<VoiceSettings> = {
        stability: 0.5,
        similarityBoost: 0.8,
      };

      const key1 = cacheService.generateKey({
        text: 'Hello world',
        voiceId: 'voice-123',
        settings: fullSettings,
      });
      const key2 = cacheService.generateKey({
        text: 'Hello world',
        voiceId: 'voice-123',
        settings: partialSettings,
      });

      expect(key1).not.toBe(key2);
    });

    it('should generate same key with and without empty settings', () => {
      const keyWithoutSettings = cacheService.generateKey({
        text: 'Hello world',
        voiceId: 'voice-123',
      });
      const keyWithEmptySettings = cacheService.generateKey({
        text: 'Hello world',
        voiceId: 'voice-123',
        settings: {},
      });

      expect(keyWithoutSettings).toBe(keyWithEmptySettings);
    });
  });

  describe('get', () => {
    it('should return cached buffer on hit', async () => {
      const testBuffer = Buffer.from('audio data');
      mockRedis.getBuffer.mockResolvedValue(testBuffer);

      const result = await cacheService.get('tts:test-key');

      expect(result).toEqual(testBuffer);
      expect(mockRedis.getBuffer).toHaveBeenCalledWith('tts:test-key');
    });

    it('should return null on cache miss', async () => {
      mockRedis.getBuffer.mockResolvedValue(null);

      const result = await cacheService.get('tts:nonexistent-key');

      expect(result).toBeNull();
    });

    it('should return null on Redis error', async () => {
      mockRedis.getBuffer.mockRejectedValue(new Error('Redis connection failed'));

      const result = await cacheService.get('tts:test-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should store buffer with TTL', async () => {
      const testBuffer = Buffer.from('audio data');
      const ttl = 604800; // 7 days in seconds

      await cacheService.set('tts:test-key', testBuffer, ttl);

      expect(mockRedis.setex).toHaveBeenCalledWith('tts:test-key', ttl, testBuffer);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis write failed'));
      const testBuffer = Buffer.from('audio data');

      // Should not throw
      await expect(cacheService.set('tts:test-key', testBuffer, 3600)).resolves.not.toThrow();
    });
  });

  describe('getTTL', () => {
    it('should return 7 days for narration content', () => {
      const ttl = cacheService.getTTL('narration');
      expect(ttl).toBe(7 * 24 * 60 * 60); // 604800 seconds
    });

    it('should return 30 days for static_dialogue content', () => {
      const ttl = cacheService.getTTL('static_dialogue');
      expect(ttl).toBe(30 * 24 * 60 * 60); // 2592000 seconds
    });
  });

  describe('getContentTypeForRole', () => {
    it('should return narration for narrator role', () => {
      const contentType = cacheService.getContentTypeForRole('narrator');
      expect(contentType).toBe('narration');
    });

    it('should return narration for judge role', () => {
      const contentType = cacheService.getContentTypeForRole('judge');
      expect(contentType).toBe('narration');
    });

    it('should return static_dialogue for npc role', () => {
      const contentType = cacheService.getContentTypeForRole('npc');
      expect(contentType).toBe('static_dialogue');
    });

    it('should return static_dialogue for inner_voice role', () => {
      const contentType = cacheService.getContentTypeForRole('inner_voice');
      expect(contentType).toBe('static_dialogue');
    });

    it('should return static_dialogue for undefined role', () => {
      const contentType = cacheService.getContentTypeForRole(undefined);
      expect(contentType).toBe('static_dialogue');
    });
  });

  describe('isConnected', () => {
    it('should return true when connected', () => {
      // Connection was simulated in beforeEach
      expect(cacheService.isConnected()).toBe(true);
    });

    it('should return false after close event', async () => {
      // Simulate close event
      const closeCallback = mockRedis.on.mock.calls.find(
        (call: [string, () => void]) => call[0] === 'close'
      )?.[1];
      if (closeCallback) closeCallback();

      expect(cacheService.isConnected()).toBe(false);
    });
  });

  describe('connect', () => {
    it('should call Redis connect', async () => {
      // Reset connection state by simulating close
      const closeCallback = mockRedis.on.mock.calls.find(
        (call: [string, () => void]) => call[0] === 'close'
      )?.[1];
      if (closeCallback) closeCallback();

      await cacheService.connect();

      expect(mockRedis.connect).toHaveBeenCalled();
    });

    it('should not call connect if already connected', async () => {
      // Already connected from beforeEach
      mockRedis.connect.mockClear();

      await cacheService.connect();

      expect(mockRedis.connect).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should call Redis quit', async () => {
      await cacheService.close();

      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });
});
