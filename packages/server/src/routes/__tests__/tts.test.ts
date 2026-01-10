import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { ttsRoutes } from '../tts.js';

// Create mock Redis instance that persists across imports
const mockRedisInstance = {
  connect: vi.fn().mockResolvedValue(undefined),
  getBuffer: vi.fn(),
  setex: vi.fn().mockResolvedValue('OK'),
  quit: vi.fn().mockResolvedValue('OK'),
  on: vi.fn(),
  status: 'ready',
};

// Mock ioredis
vi.mock('ioredis', () => {
  return {
    default: vi.fn(() => mockRedisInstance),
  };
});

// Mock global fetch for ElevenLabs API calls
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

describe('TTS Routes', () => {
  let app: FastifyInstance;

  beforeAll(() => {
    // Simulate Redis connection event
    const connectCallback = mockRedisInstance.on.mock.calls.find(
      (call: [string, () => void]) => call[0] === 'connect'
    )?.[1];
    if (connectCallback) connectCallback();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockRedisInstance.connect.mockResolvedValue(undefined);
    mockRedisInstance.getBuffer.mockResolvedValue(null);
    mockRedisInstance.setex.mockResolvedValue('OK');
    mockRedisInstance.on.mockImplementation((event: string, callback: () => void) => {
      if (event === 'connect') {
        // Simulate immediate connection
        setTimeout(callback, 0);
      }
      return mockRedisInstance;
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

  describe('POST /api/tts/speak', () => {
    describe('request validation', () => {
      it('should return 400 for missing text', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { voiceId: 'voice-123' },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.code).toBe('INVALID_REQUEST');
        expect(body.message).toContain('Text is required');
      });

      it('should return 400 for empty text', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: '', voiceId: 'voice-123' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().code).toBe('INVALID_REQUEST');
      });

      it('should return 400 for whitespace-only text', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: '   ', voiceId: 'voice-123' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().code).toBe('INVALID_REQUEST');
      });

      it('should fall back to narrator voice when no voice ID specified', async () => {
        // Implementation falls back to narrator, doesn't error
        const audioData = new Uint8Array([1, 2, 3, 4]);
        mockFetch.mockResolvedValue({
          ok: true,
          body: createMockStream(audioData),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello world' },
        });

        // Should succeed with fallback to narrator
        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('audio/mpeg');
      });
    });

    describe('cache behavior', () => {
      it('should return cached audio on cache hit', async () => {
        const cachedAudio = Buffer.from('cached audio data');
        mockRedisInstance.getBuffer.mockResolvedValue(cachedAudio);

        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello world', voiceId: 'voice-123' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('audio/mpeg');
        expect(response.headers['x-cache']).toBe('HIT');
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should call ElevenLabs API on cache miss', async () => {
        mockRedisInstance.getBuffer.mockResolvedValue(null);
        const audioData = new Uint8Array([1, 2, 3, 4]);
        mockFetch.mockResolvedValue({
          ok: true,
          body: createMockStream(audioData),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello world', voiceId: 'voice-123' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('audio/mpeg');
        expect(response.headers['x-cache']).toBe('MISS');
        expect(mockFetch).toHaveBeenCalled();
      });

      it('should store response in cache after fetching', async () => {
        mockRedisInstance.getBuffer.mockResolvedValue(null);
        const audioData = new Uint8Array([1, 2, 3, 4]);
        mockFetch.mockResolvedValue({
          ok: true,
          body: createMockStream(audioData),
        });

        await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello world', voiceId: 'voice-123' },
        });

        // Wait for async cache store
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockRedisInstance.setex).toHaveBeenCalled();
      });
    });

    describe('voice resolution', () => {
      it('should use voiceId when provided', async () => {
        mockRedisInstance.getBuffer.mockResolvedValue(null);
        const audioData = new Uint8Array([1, 2, 3, 4]);
        mockFetch.mockResolvedValue({
          ok: true,
          body: createMockStream(audioData),
        });

        await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello', voiceId: 'custom-voice-id' },
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('custom-voice-id'),
          expect.anything()
        );
      });

      it('should resolve role to default voice ID from registry', async () => {
        mockRedisInstance.getBuffer.mockResolvedValue(null);
        const audioData = new Uint8Array([1, 2, 3, 4]);
        mockFetch.mockResolvedValue({
          ok: true,
          body: createMockStream(audioData),
        });

        await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello', role: 'narrator' },
        });

        // Should have called fetch with some voice ID (from registry)
        expect(mockFetch).toHaveBeenCalled();
        const fetchUrl = mockFetch.mock.calls[0][0] as string;
        expect(fetchUrl).toContain('text-to-speech/');
      });
    });

    describe('preset settings', () => {
      it('should apply preset voice settings', async () => {
        mockRedisInstance.getBuffer.mockResolvedValue(null);
        const audioData = new Uint8Array([1, 2, 3, 4]);
        mockFetch.mockResolvedValue({
          ok: true,
          body: createMockStream(audioData),
        });

        await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: {
            text: 'Hello',
            voiceId: 'voice-123',
            preset: 'chronicle',
          },
        });

        const fetchCall = mockFetch.mock.calls[0];
        const body = JSON.parse(fetchCall[1].body as string);
        // Preset should apply voice settings
        expect(body.voice_settings).toBeDefined();
      });
    });

    describe('error handling', () => {
      it('should return 500 when API key is not configured', async () => {
        delete process.env.ELEVENLABS_API_KEY;
        mockRedisInstance.getBuffer.mockResolvedValue(null);

        // Need to create fresh app without API key
        const appNoKey = Fastify({ logger: false });
        await appNoKey.register(ttsRoutes, { prefix: '/api/tts' });
        await appNoKey.ready();

        const response = await appNoKey.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello', voiceId: 'voice-123' },
        });

        expect(response.statusCode).toBe(500);
        expect(response.json().code).toBe('INTERNAL_ERROR');

        await appNoKey.close();
      });

      it('should return error status on ElevenLabs API error', async () => {
        mockRedisInstance.getBuffer.mockResolvedValue(null);
        // Use 400 (non-retryable) to avoid retry delays
        mockFetch.mockResolvedValue({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: vi.fn().mockResolvedValue({ detail: { message: 'Invalid request' } }),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello', voiceId: 'voice-123' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().code).toBe('TTS_ERROR');
      });

      it('should mark server errors as retryable', { timeout: 15000 }, async () => {
        mockRedisInstance.getBuffer.mockResolvedValue(null);
        // 5xx errors trigger retries, so we need longer timeout
        mockFetch.mockResolvedValue({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: vi.fn().mockResolvedValue({ detail: { message: 'Overloaded' } }),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello', voiceId: 'voice-123' },
        });

        const body = response.json();
        expect(body.code).toBe('TTS_ERROR');
        expect(body.retryable).toBe(true);
      });
    });

    describe('graceful degradation', () => {
      it('should continue without cache when Redis throws error', async () => {
        // TTSCacheService catches getBuffer errors and returns null
        // This is treated as a cache miss, not a cache skip
        mockRedisInstance.getBuffer.mockRejectedValue(new Error('Redis unavailable'));
        const audioData = new Uint8Array([1, 2, 3, 4]);
        mockFetch.mockResolvedValue({
          ok: true,
          body: createMockStream(audioData),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello', voiceId: 'voice-123' },
        });

        expect(response.statusCode).toBe(200);
        // TTSCacheService gracefully handles errors by returning null
        // So from the route's perspective, this is a cache miss
        expect(response.headers['x-cache']).toBe('MISS');
        expect(mockFetch).toHaveBeenCalled();
      });
    });
  });

  describe('GET /api/tts/voices', () => {
    it('should return list of available voices', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tts/voices',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('voices');
      expect(Array.isArray(body.voices)).toBe(true);
    });
  });

  describe('GET /api/tts/config', () => {
    it('should return voice configuration', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tts/config',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('mappings');
      expect(body).toHaveProperty('presets');
    });
  });

  describe('GET /api/tts/presets', () => {
    it('should return list of presets', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tts/presets',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('presets');
      expect(Array.isArray(body.presets)).toBe(true);
    });
  });

  describe('POST /api/tts/config/voice', () => {
    it('should update voice mapping for a role', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tts/config/voice',
        payload: {
          role: 'narrator',
          voiceId: 'new-voice-id',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.mapping.voiceId).toBe('new-voice-id');
    });

    it('should return 400 for invalid role', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tts/config/voice',
        payload: {
          role: 'invalid_role',
          voiceId: 'voice-id',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/tts/config/reset', () => {
    it('should reset all voice mappings to defaults', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tts/config/reset',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('config');
    });
  });
});
