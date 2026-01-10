/**
 * E2E Tests for TTS System
 *
 * These tests verify the full text-to-speech flow from request to audio response,
 * including cache behavior verification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { ttsRoutes } from '../routes/tts.js';
import type { TTSRequest, TTSResponse, TTSError } from '@reckoning/shared';

// Mock ioredis with a more realistic in-memory implementation
const mockCache = new Map<string, Buffer>();
vi.mock('ioredis', () => {
  const mockRedis = {
    connect: vi.fn().mockResolvedValue(undefined),
    getBuffer: vi.fn((key: string) => Promise.resolve(mockCache.get(key) ?? null)),
    setex: vi.fn((key: string, _ttl: number, value: Buffer) => {
      mockCache.set(key, value);
      return Promise.resolve('OK');
    }),
    quit: vi.fn().mockResolvedValue('OK'),
    on: vi.fn(),
  };
  return {
    default: vi.fn(() => mockRedis),
  };
});

// Mock ElevenLabs API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Sample audio data (simulated MP3 header + content)
const SAMPLE_AUDIO_HEADER = new Uint8Array([0xff, 0xfb, 0x90, 0x00]); // MP3 sync bytes
function createSampleAudioData(text: string): ArrayBuffer {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(text);
  const combined = new Uint8Array(SAMPLE_AUDIO_HEADER.length + textBytes.length);
  combined.set(SAMPLE_AUDIO_HEADER, 0);
  combined.set(textBytes, SAMPLE_AUDIO_HEADER.length);
  return combined.buffer;
}

describe('TTS E2E Tests', () => {
  let app: FastifyInstance;
  let mockRedis: {
    on: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCache.clear();

    // Set up environment
    process.env.ELEVENLABS_API_KEY = 'test-api-key';
    process.env.TTS_VOICE_NARRATOR = 'narrator-voice-id';
    process.env.TTS_VOICE_JUDGE = 'judge-voice-id';
    process.env.TTS_VOICE_NPC = 'npc-voice-id';
    process.env.TTS_VOICE_INNER = 'inner-voice-id';

    // Create Fastify instance
    app = Fastify({ logger: false });
    await app.register(ttsRoutes, { prefix: '/api/tts' });

    // Get mock Redis and simulate connection
    const Redis = (await import('ioredis')).default;
    mockRedis = Redis.mock.results[Redis.mock.results.length - 1].value;
    const connectCallback = mockRedis.on.mock.calls.find(
      (call: [string, () => void]) => call[0] === 'connect'
    )?.[1];
    if (connectCallback) connectCallback();

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.TTS_VOICE_NARRATOR;
    delete process.env.TTS_VOICE_JUDGE;
    delete process.env.TTS_VOICE_NPC;
    delete process.env.TTS_VOICE_INNER;
  });

  describe('Full Speech Request Flow', () => {
    it('should complete a full TTS request cycle: request → API → cache → response', async () => {
      const testText = 'In the shadows of the forgotten realm, a hero emerged.';
      const audioData = createSampleAudioData(testText);

      // Mock ElevenLabs API response
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(audioData),
      });

      // First request - should hit ElevenLabs API
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: {
          text: testText,
          voiceId: 'narrator-voice-id',
          settings: {
            stability: 0.7,
            similarityBoost: 0.8,
          },
        } satisfies TTSRequest,
      });

      expect(response1.statusCode).toBe(200);
      expect(response1.headers['content-type']).toBe('audio/mpeg');

      const ttsResponse1: TTSResponse = JSON.parse(response1.headers['x-tts-response'] as string);
      expect(ttsResponse1.cached).toBe(false);
      expect(ttsResponse1.characterCount).toBe(testText.length);
      expect(ttsResponse1.contentType).toBe('audio/mpeg');

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
        arrayBuffer: vi.fn().mockResolvedValue(audioData),
      });

      const request: TTSRequest = {
        text: testText,
        role: 'judge',
      };

      // First request
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: request,
      });

      expect(response1.statusCode).toBe(200);
      const meta1: TTSResponse = JSON.parse(response1.headers['x-tts-response'] as string);
      expect(meta1.cached).toBe(false);

      // Wait for cache population
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Clear the fetch mock to verify it's not called again
      mockFetch.mockClear();

      // Second request with same parameters
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: request,
      });

      expect(response2.statusCode).toBe(200);
      const meta2: TTSResponse = JSON.parse(response2.headers['x-tts-response'] as string);
      expect(meta2.cached).toBe(true);

      // Verify API was NOT called (served from cache)
      expect(mockFetch).not.toHaveBeenCalled();

      // Verify same audio data is returned
      expect(response2.rawPayload).toEqual(response1.rawPayload);
    });

    it('should generate different cache keys for different voice settings', async () => {
      const testText = 'Settings matter for cache keys.';
      const audioData = createSampleAudioData(testText);

      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(audioData),
      });

      // Request with stability=0.5
      await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: {
          text: testText,
          voiceId: 'voice-123',
          settings: { stability: 0.5 },
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockCache.size).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Request with stability=0.8 - should NOT use cache
      await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: {
          text: testText,
          voiceId: 'voice-123',
          settings: { stability: 0.8 },
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
      const error: TTSError = response.json();
      expect(error.code).toBe('INVALID_REQUEST');
      expect(error.message).toBeDefined();
      expect(error.retryable).toBe(false);
    });

    it('should handle ElevenLabs API failures gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error'),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: { text: 'Hello', voiceId: 'voice-123' },
      });

      expect(response.statusCode).toBe(502);
      const error: TTSError = response.json();
      expect(error.code).toBe('PROVIDER_ERROR');
      expect(error.retryable).toBe(true);
    });

    it('should handle rate limiting from ElevenLabs', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: vi.fn().mockResolvedValue('Rate limit exceeded'),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: { text: 'Hello', voiceId: 'voice-123' },
      });

      expect(response.statusCode).toBe(502);
      const error: TTSError = response.json();
      expect(error.retryable).toBe(true);
    });
  });

  describe('Voice Role Resolution', () => {
    it('should resolve all supported voice roles', async () => {
      const roles = ['narrator', 'judge', 'npc', 'inner_voice'] as const;
      const expectedVoiceIds = {
        narrator: 'narrator-voice-id',
        judge: 'judge-voice-id',
        npc: 'npc-voice-id',
        inner_voice: 'inner-voice-id',
      };

      for (const role of roles) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(createSampleAudioData(`Test for ${role}`)),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: `Test for ${role}`, role },
        });

        expect(response.statusCode).toBe(200);
        expect(mockFetch).toHaveBeenLastCalledWith(
          expect.stringContaining(expectedVoiceIds[role]),
          expect.anything()
        );
      }
    });
  });

  describe('Cache Bypass', () => {
    it('should bypass cache when cache=false', async () => {
      const testText = 'Bypass the cache please.';
      const audioData = createSampleAudioData(testText);

      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(audioData),
      });

      // First request (populates cache)
      await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: { text: testText, voiceId: 'voice-123' },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second request with cache=false
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: { text: testText, voiceId: 'voice-123', cache: false },
      });

      expect(response2.statusCode).toBe(200);
      const meta: TTSResponse = JSON.parse(response2.headers['x-tts-response'] as string);
      expect(meta.cached).toBe(false);

      // API should be called again despite cache having data
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Response Metadata', () => {
    it('should include accurate character count in response', async () => {
      const texts = [
        'Short.',
        'A medium length sentence for testing.',
        'This is a much longer piece of text that should be counted accurately by the TTS system. It includes multiple sentences and various punctuation marks!',
      ];

      for (const text of texts) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(createSampleAudioData(text)),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text, voiceId: 'voice-123', cache: false },
        });

        const meta: TTSResponse = JSON.parse(response.headers['x-tts-response'] as string);
        expect(meta.characterCount).toBe(text.length);
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
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(createSampleAudioData(body.text)),
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
});
