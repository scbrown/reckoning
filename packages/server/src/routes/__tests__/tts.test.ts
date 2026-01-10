import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { ttsRoutes } from '../tts.js';

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

// Mock global fetch for ElevenLabs API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TTS Routes', () => {
  let app: FastifyInstance;
  let mockRedis: {
    connect: ReturnType<typeof vi.fn>;
    getBuffer: ReturnType<typeof vi.fn>;
    setex: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set up environment
    process.env.ELEVENLABS_API_KEY = 'test-api-key';
    process.env.TTS_VOICE_NARRATOR = 'narrator-voice-id';
    process.env.TTS_VOICE_JUDGE = 'judge-voice-id';

    // Create Fastify instance
    app = Fastify({ logger: false });
    await app.register(ttsRoutes, { prefix: '/api/tts' });

    // Get mock Redis instance
    const Redis = (await import('ioredis')).default;
    mockRedis = Redis.mock.results[Redis.mock.results.length - 1].value;

    // Simulate Redis connection
    const connectCallback = mockRedis.on.mock.calls.find(
      (call: [string, () => void]) => call[0] === 'connect'
    )?.[1];
    if (connectCallback) connectCallback();

    // Initialize the app (triggers onReady hook)
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.TTS_VOICE_NARRATOR;
    delete process.env.TTS_VOICE_JUDGE;
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

      it('should return 400 when no voice ID and no default for role', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello world' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().code).toBe('VOICE_NOT_FOUND');
      });
    });

    describe('cache behavior', () => {
      it('should return cached audio on cache hit', async () => {
        const cachedAudio = Buffer.from('cached audio data');
        mockRedis.getBuffer.mockResolvedValue(cachedAudio);

        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello world', voiceId: 'voice-123' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('audio/mpeg');

        const ttsResponse = JSON.parse(response.headers['x-tts-response'] as string);
        expect(ttsResponse.cached).toBe(true);
        expect(ttsResponse.characterCount).toBe(11);

        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should call ElevenLabs API on cache miss', async () => {
        mockRedis.getBuffer.mockResolvedValue(null);
        mockFetch.mockResolvedValue({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello world', voiceId: 'voice-123' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('audio/mpeg');

        const ttsResponse = JSON.parse(response.headers['x-tts-response'] as string);
        expect(ttsResponse.cached).toBe(false);

        expect(mockFetch).toHaveBeenCalled();
      });

      it('should store response in cache after fetching', async () => {
        mockRedis.getBuffer.mockResolvedValue(null);
        mockFetch.mockResolvedValue({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        });

        await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello world', voiceId: 'voice-123' },
        });

        // Wait for async cache store
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockRedis.setex).toHaveBeenCalled();
      });

      it('should respect cache=false option', async () => {
        const cachedAudio = Buffer.from('cached audio');
        mockRedis.getBuffer.mockResolvedValue(cachedAudio);
        mockFetch.mockResolvedValue({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello world', voiceId: 'voice-123', cache: false },
        });

        expect(response.statusCode).toBe(200);
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    describe('voice resolution', () => {
      it('should use voiceId when provided', async () => {
        mockRedis.getBuffer.mockResolvedValue(null);
        mockFetch.mockResolvedValue({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
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

      it('should resolve role to default voice ID', async () => {
        mockRedis.getBuffer.mockResolvedValue(null);
        mockFetch.mockResolvedValue({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        });

        await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello', role: 'narrator' },
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('narrator-voice-id'),
          expect.anything()
        );
      });
    });

    describe('voice settings', () => {
      it('should pass voice settings to ElevenLabs API', async () => {
        mockRedis.getBuffer.mockResolvedValue(null);
        mockFetch.mockResolvedValue({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        });

        await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: {
            text: 'Hello',
            voiceId: 'voice-123',
            settings: {
              stability: 0.8,
              similarityBoost: 0.9,
            },
          },
        });

        const fetchCall = mockFetch.mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.voice_settings.stability).toBe(0.8);
        expect(body.voice_settings.similarity_boost).toBe(0.9);
      });
    });

    describe('error handling', () => {
      it('should return 500 when API key is not configured', async () => {
        delete process.env.ELEVENLABS_API_KEY;
        mockRedis.getBuffer.mockResolvedValue(null);

        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello', voiceId: 'voice-123' },
        });

        expect(response.statusCode).toBe(500);
        expect(response.json().code).toBe('INTERNAL_ERROR');
      });

      it('should return 502 on ElevenLabs API error', async () => {
        mockRedis.getBuffer.mockResolvedValue(null);
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
        expect(response.json().code).toBe('PROVIDER_ERROR');
        expect(response.json().retryable).toBe(true);
      });
    });

    describe('TTL selection', () => {
      it('should use narration TTL for narrator role', async () => {
        mockRedis.getBuffer.mockResolvedValue(null);
        mockFetch.mockResolvedValue({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        });

        await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello', role: 'narrator' },
        });

        // Wait for async cache store
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Narrator should use 7-day TTL (604800 seconds)
        expect(mockRedis.setex).toHaveBeenCalledWith(
          expect.any(String),
          604800,
          expect.any(Buffer)
        );
      });

      it('should use static_dialogue TTL for NPC role', async () => {
        process.env.TTS_VOICE_NPC = 'npc-voice-id';
        mockRedis.getBuffer.mockResolvedValue(null);
        mockFetch.mockResolvedValue({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        });

        await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Hello', role: 'npc' },
        });

        // Wait for async cache store
        await new Promise((resolve) => setTimeout(resolve, 10));

        // NPC should use 30-day TTL (2592000 seconds)
        expect(mockRedis.setex).toHaveBeenCalledWith(
          expect.any(String),
          2592000,
          expect.any(Buffer)
        );
      });
    });

    describe('response headers', () => {
      it('should include X-TTS-Response header with metadata', async () => {
        const cachedAudio = Buffer.from('audio');
        mockRedis.getBuffer.mockResolvedValue(cachedAudio);

        const response = await app.inject({
          method: 'POST',
          url: '/api/tts/speak',
          payload: { text: 'Test text', voiceId: 'voice-123' },
        });

        const ttsResponse = JSON.parse(response.headers['x-tts-response'] as string);
        expect(ttsResponse).toHaveProperty('cached');
        expect(ttsResponse).toHaveProperty('contentType');
        expect(ttsResponse).toHaveProperty('characterCount');
        expect(ttsResponse.characterCount).toBe(9); // "Test text".length
      });
    });
  });

  describe('graceful degradation', () => {
    it('should continue without cache when Redis is unavailable', async () => {
      // Simulate Redis disconnection
      const closeCallback = mockRedis.on.mock.calls.find(
        (call: [string, () => void]) => call[0] === 'close'
      )?.[1];
      if (closeCallback) closeCallback();

      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/tts/speak',
        payload: { text: 'Hello', voiceId: 'voice-123' },
      });

      expect(response.statusCode).toBe(200);
      // Should call API directly without cache check
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
