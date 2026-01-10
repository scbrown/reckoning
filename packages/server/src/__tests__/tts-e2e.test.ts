/**
 * E2E Tests for TTS System
 *
 * These tests verify the full text-to-speech flow from request to audio response,
 * including cache behavior verification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { ttsRoutes } from '../routes/tts.js';

// Create mock Redis instance that persists across imports
const mockCache = new Map<string, Buffer>();
const mockRedisInstance = {
  connect: vi.fn().mockResolvedValue(undefined),
  getBuffer: vi.fn((key: string) => Promise.resolve(mockCache.get(key) ?? null)),
  setex: vi.fn((key: string, _ttl: number, value: Buffer) => {
    mockCache.set(key, value);
    return Promise.resolve('OK');
  }),
  quit: vi.fn().mockResolvedValue('OK'),
  on: vi.fn().mockImplementation((event: string, callback: () => void) => {
    if (event === 'connect') {
      setTimeout(callback, 0);
    }
    return mockRedisInstance;
  }),
  status: 'ready',
};

// Mock ioredis
vi.mock('ioredis', () => {
  return {
    default: vi.fn(() => mockRedisInstance),
  };
});

// Mock ElevenLabs API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create a mock ReadableStream from data
function createMockStream(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

// Sample audio data (simulated MP3 header + content)
const SAMPLE_AUDIO_HEADER = new Uint8Array([0xff, 0xfb, 0x90, 0x00]); // MP3 sync bytes
function createSampleAudioData(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(text);
  const combined = new Uint8Array(SAMPLE_AUDIO_HEADER.length + textBytes.length);
  combined.set(SAMPLE_AUDIO_HEADER, 0);
  combined.set(textBytes, SAMPLE_AUDIO_HEADER.length);
  return combined;
}

describe('TTS E2E Tests', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCache.clear();

    // Reset mock implementations
    mockRedisInstance.getBuffer.mockImplementation((key: string) =>
      Promise.resolve(mockCache.get(key) ?? null)
    );
    mockRedisInstance.setex.mockImplementation((key: string, _ttl: number, value: Buffer) => {
      mockCache.set(key, value);
      return Promise.resolve('OK');
    });

    // Set up environment
    process.env.ELEVENLABS_API_KEY = 'test-api-key';

    // Create Fastify instance
    app = Fastify({ logger: false });
    await app.register(ttsRoutes, { prefix: '/api/tts' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ELEVENLABS_API_KEY;
  });

  describe('Full Speech Request Flow', () => {
    it('should complete a full TTS request cycle: request → API → cache → response', async () => {
      const testText = 'In the shadows of the forgotten realm, a hero emerged.';
      const audioData = createSampleAudioData(testText);

      // Mock ElevenLabs API response
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(audioData),
      });

      // First request - should hit ElevenLabs API
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: {
          text: testText,
          voiceId: 'narrator-voice-id',
        },
      });

      expect(response1.statusCode).toBe(200);
      expect(response1.headers['content-type']).toBe('audio/mpeg');
      expect(response1.headers['x-cache']).toBe('MISS');

      // Verify audio data is returned
      expect(response1.rawPayload.length).toBeGreaterThan(0);

      // Verify API was called
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('narrator-voice-id'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'xi-api-key': 'test-api-key',
          }),
        })
      );

      // Wait for cache to be populated (async operation)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify cache was populated
      expect(mockCache.size).toBe(1);
    });

    it('should serve subsequent requests from cache', async () => {
      const testText = 'The judge speaks with eternal authority.';
      const audioData = createSampleAudioData(testText);

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(audioData),
      });

      // First request
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: {
          text: testText,
          role: 'judge',
        },
      });

      expect(response1.statusCode).toBe(200);
      expect(response1.headers['x-cache']).toBe('MISS');

      // Wait for cache population
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Clear the fetch mock to verify it's not called again
      mockFetch.mockClear();

      // Second request with same parameters
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: {
          text: testText,
          role: 'judge',
        },
      });

      expect(response2.statusCode).toBe(200);
      expect(response2.headers['x-cache']).toBe('HIT');

      // Verify API was NOT called (served from cache)
      expect(mockFetch).not.toHaveBeenCalled();

      // Verify same audio data is returned
      expect(response2.rawPayload).toEqual(response1.rawPayload);
    });

    it('should generate different cache keys for different presets', async () => {
      const testText = 'Presets matter for cache keys.';
      const audioData = createSampleAudioData(testText);

      // Each call needs a fresh stream since streams can only be read once
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          body: createMockStream(audioData),
        })
      );

      // Request with chronicle preset
      await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: {
          text: testText,
          voiceId: 'voice-123',
          preset: 'chronicle',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockCache.size).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Request with dialogue_intense preset - should NOT use cache (different settings)
      await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: {
          text: testText,
          voiceId: 'voice-123',
          preset: 'dialogue_intense',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockCache.size).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Scenarios', () => {
    it('should return proper error structure for invalid requests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: { text: '', voiceId: 'voice-123' },
      });

      expect(response.statusCode).toBe(400);
      const error = response.json();
      expect(error.code).toBe('INVALID_REQUEST');
      expect(error.message).toBeDefined();
    });

    it('should handle ElevenLabs API failures gracefully', async () => {
      // Use 400 to avoid retry delays
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValue({ detail: { message: 'Invalid voice' } }),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: { text: 'Hello', voiceId: 'voice-123' },
      });

      expect(response.statusCode).toBe(400);
      const error = response.json();
      expect(error.code).toBe('TTS_ERROR');
    });

    it('should handle rate limiting from ElevenLabs', { timeout: 15000 }, async () => {
      // 429 triggers retries, so we need longer timeout
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: vi.fn().mockResolvedValue({ detail: { message: 'Rate limit exceeded' } }),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: { text: 'Hello', voiceId: 'voice-123' },
      });

      expect(response.statusCode).toBe(429);
      const error = response.json();
      expect(error.retryable).toBe(true);
    });
  });

  describe('Voice Role Resolution', () => {
    it('should resolve voice roles using registry defaults', async () => {
      const roles = ['narrator', 'judge', 'npc', 'inner_voice'] as const;

      for (const role of roles) {
        const audioData = createSampleAudioData(`Test for ${role}`);
        mockFetch.mockResolvedValueOnce({
          ok: true,
          body: createMockStream(audioData),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: `Test for ${role}`, role },
        });

        expect(response.statusCode).toBe(200);
        expect(mockFetch).toHaveBeenCalled();
      }
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle multiple concurrent requests', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        text: `Concurrent request number ${i}`,
        voiceId: 'voice-123',
      }));

      // Each request gets unique audio
      mockFetch.mockImplementation((url: string, options: { body: string }) => {
        const body = JSON.parse(options.body);
        const audioData = createSampleAudioData(body.text);
        return Promise.resolve({
          ok: true,
          body: createMockStream(audioData),
        });
      });

      // Send all requests concurrently
      const responses = await Promise.all(
        requests.map((payload) =>
          app.inject({
            method: 'POST',
            url: '/api/tts/speak',
            payload,
          })
        )
      );

      // All should succeed
      responses.forEach((response) => {
        expect(response.statusCode).toBe(200);
      });

      // All should have called the API (different texts = different cache keys)
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });
  });

  describe('Graceful Degradation', () => {
    it('should continue when Redis get fails', async () => {
      // TTSCacheService catches getBuffer errors and returns null
      // This is treated as a cache miss, not a cache skip
      mockRedisInstance.getBuffer.mockRejectedValue(new Error('Redis connection refused'));
      const audioData = createSampleAudioData('Testing graceful degradation');

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(audioData),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: { text: 'Testing graceful degradation', voiceId: 'voice-123' },
      });

      expect(response.statusCode).toBe(200);
      // TTSCacheService gracefully handles errors by returning null
      // So from the route's perspective, this is a cache miss
      expect(response.headers['x-cache']).toBe('MISS');
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
