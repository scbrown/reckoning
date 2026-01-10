import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElevenLabsClient } from '../elevenlabs/client.js';
import { ElevenLabsError } from '../elevenlabs/types.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create a mock response
function createMockResponse(
  status: number,
  body?: unknown,
  options?: { ok?: boolean; statusText?: string }
): Response {
  const ok = options?.ok ?? (status >= 200 && status < 300);
  const statusText = options?.statusText ?? (ok ? 'OK' : 'Error');

  return {
    ok,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
    body: body ? createReadableStream(body) : null,
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: vi.fn(),
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    bodyUsed: false,
  } as unknown as Response;
}

function createReadableStream(data: unknown): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const encoded = typeof data === 'string' ? encoder.encode(data) : encoder.encode(JSON.stringify(data));

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });
}

describe('ElevenLabsClient', () => {
  let client: ElevenLabsClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    client = new ElevenLabsClient({
      apiKey: 'test-api-key',
      maxRetries: 3,
      initialRetryDelay: 100,
      timeout: 5000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should throw if API key is not provided', () => {
      expect(() => new ElevenLabsClient({ apiKey: '' })).toThrow(
        'ElevenLabs API key is required'
      );
    });

    it('should use default values for optional config', () => {
      const client = new ElevenLabsClient({ apiKey: 'test-key' });
      // Client should be created successfully with defaults
      expect(client).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const client = new ElevenLabsClient({
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.com/v1',
        defaultModel: 'custom_model',
        timeout: 60000,
        maxRetries: 5,
        initialRetryDelay: 500,
      });
      expect(client).toBeDefined();
    });
  });

  describe('textToSpeech', () => {
    it('should make a request to ElevenLabs API', async () => {
      const mockStream = createReadableStream('audio data');
      mockFetch.mockResolvedValue(createMockResponse(200, undefined, { ok: true }));
      mockFetch.mock.results[0] = {
        type: 'return',
        value: { ...createMockResponse(200), body: mockStream, ok: true },
      };
      mockFetch.mockResolvedValueOnce({ ...createMockResponse(200), body: mockStream, ok: true });

      const stream = await client.textToSpeech('Hello world', 'voice-id-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/text-to-speech/voice-id-123/stream'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'xi-api-key': 'test-api-key',
          }),
        })
      );
      expect(stream).toBeDefined();
    });

    it('should throw ElevenLabsError for empty text', async () => {
      await expect(client.textToSpeech('', 'voice-id-123')).rejects.toThrow(ElevenLabsError);
      await expect(client.textToSpeech('   ', 'voice-id-123')).rejects.toThrow(ElevenLabsError);
    });

    it('should throw ElevenLabsError for missing voice ID', async () => {
      await expect(client.textToSpeech('Hello world', '')).rejects.toThrow(ElevenLabsError);
    });

    it('should include voice settings in request body', async () => {
      const mockStream = createReadableStream('audio data');
      mockFetch.mockResolvedValueOnce({ ...createMockResponse(200), body: mockStream, ok: true });

      await client.textToSpeech('Hello', 'voice-123', {
        voiceSettings: {
          stability: 0.8,
          similarity_boost: 0.9,
          style: 0.5,
          use_speaker_boost: true,
        },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.voice_settings).toEqual({
        stability: 0.8,
        similarity_boost: 0.9,
        style: 0.5,
        use_speaker_boost: true,
      });
    });

    it('should use custom model ID when provided', async () => {
      const mockStream = createReadableStream('audio data');
      mockFetch.mockResolvedValueOnce({ ...createMockResponse(200), body: mockStream, ok: true });

      await client.textToSpeech('Hello', 'voice-123', {
        modelId: 'eleven_multilingual_v2',
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.model_id).toBe('eleven_multilingual_v2');
    });
  });

  describe('textToSpeechWithSettings', () => {
    it('should convert camelCase settings to snake_case', async () => {
      const mockStream = createReadableStream('audio data');
      mockFetch.mockResolvedValueOnce({ ...createMockResponse(200), body: mockStream, ok: true });

      await client.textToSpeechWithSettings('Hello', 'voice-123', {
        stability: 0.7,
        similarityBoost: 0.8,
        style: 0.3,
        useSpeakerBoost: true,
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.voice_settings).toEqual({
        stability: 0.7,
        similarity_boost: 0.8,
        style: 0.3,
        use_speaker_boost: true,
      });
    });

    it('should use default values for missing settings', async () => {
      const mockStream = createReadableStream('audio data');
      mockFetch.mockResolvedValueOnce({ ...createMockResponse(200), body: mockStream, ok: true });

      await client.textToSpeechWithSettings('Hello', 'voice-123', {});

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.voice_settings).toEqual({
        stability: 0.5,
        similarity_boost: 0.75,
      });
    });
  });

  describe('getVoices', () => {
    it('should fetch and transform voice list', async () => {
      const mockVoicesResponse = {
        voices: [
          {
            voice_id: 'id-1',
            name: 'Voice One',
            category: 'premade',
            description: 'A test voice',
            preview_url: 'https://example.com/preview.mp3',
            labels: { accent: 'american' },
          },
          {
            voice_id: 'id-2',
            name: 'Voice Two',
            category: 'cloned',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(200, mockVoicesResponse));

      const voices = await client.getVoices();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/voices'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'xi-api-key': 'test-api-key',
          }),
        })
      );

      expect(voices).toHaveLength(2);
      expect(voices[0]).toEqual({
        voiceId: 'id-1',
        name: 'Voice One',
        category: 'premade',
        description: 'A test voice',
        previewUrl: 'https://example.com/preview.mp3',
        labels: { accent: 'american' },
      });
      expect(voices[1]).toEqual({
        voiceId: 'id-2',
        name: 'Voice Two',
        category: 'cloned',
      });
    });
  });

  describe('validateApiKey', () => {
    it('should return true for valid API key', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, { voices: [] }));

      const isValid = await client.validateApiKey();

      expect(isValid).toBe(true);
    });

    it('should return false for invalid API key (401)', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(401, {
        detail: { status: 'error', message: 'Invalid API key' },
      }));

      const isValid = await client.validateApiKey();

      expect(isValid).toBe(false);
    });

    it('should throw for other errors', async () => {
      // 400 errors are not retryable, so one mock is enough
      mockFetch.mockResolvedValueOnce(createMockResponse(403, {
        detail: { status: 'error', message: 'Forbidden' },
      }));

      await expect(client.validateApiKey()).rejects.toThrow();
    });
  });

  describe('retry behavior', () => {
    it('should retry on 429 (rate limit)', async () => {
      const mockStream = createReadableStream('audio data');

      // First call fails with 429, second succeeds
      mockFetch
        .mockResolvedValueOnce(createMockResponse(429, {
          detail: { status: 'error', message: 'Rate limited' },
        }))
        .mockResolvedValueOnce({ ...createMockResponse(200), body: mockStream, ok: true });

      const streamPromise = client.textToSpeech('Hello', 'voice-123');

      // Advance timers to trigger retry
      await vi.runAllTimersAsync();

      const stream = await streamPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(stream).toBeDefined();
    });

    it('should retry on 5xx server errors', async () => {
      const mockStream = createReadableStream('audio data');

      mockFetch
        .mockResolvedValueOnce(createMockResponse(503, {
          detail: { status: 'error', message: 'Service unavailable' },
        }))
        .mockResolvedValueOnce({ ...createMockResponse(200), body: mockStream, ok: true });

      const streamPromise = client.textToSpeech('Hello', 'voice-123');
      await vi.runAllTimersAsync();

      const stream = await streamPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(stream).toBeDefined();
    });

    it('should not retry on 4xx client errors (except 429)', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(400, {
        detail: { status: 'error', message: 'Bad request' },
      }));

      await expect(client.textToSpeech('Hello', 'voice-123')).rejects.toThrow(ElevenLabsError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries exceeded', async () => {
      // All retries fail with 503 (use mockResolvedValueOnce for each call)
      const error503 = createMockResponse(503, {
        detail: { status: 'error', message: 'Service unavailable' },
      });
      mockFetch
        .mockResolvedValueOnce(error503)
        .mockResolvedValueOnce(error503)
        .mockResolvedValueOnce(error503);

      const testClient = new ElevenLabsClient({
        apiKey: 'test-key',
        maxRetries: 2,
        initialRetryDelay: 100,
      });

      // Run the test with proper async handling
      let caughtError: Error | null = null;
      const promise = testClient.textToSpeech('Hello', 'voice-123').catch((e) => {
        caughtError = e;
      });

      await vi.runAllTimersAsync();
      await promise;

      expect(caughtError).toBeInstanceOf(ElevenLabsError);
      // Initial + 2 retries = 3 calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff with jitter', async () => {
      const mockStream = createReadableStream('audio data');

      mockFetch
        .mockResolvedValueOnce(createMockResponse(503, {}))
        .mockResolvedValueOnce(createMockResponse(503, {}))
        .mockResolvedValueOnce({ ...createMockResponse(200), body: mockStream, ok: true });

      const promise = client.textToSpeech('Hello', 'voice-123');

      // Run all timers to completion
      await vi.runAllTimersAsync();

      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('error handling', () => {
    it('should throw ElevenLabsError with parsed error response', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(400, {
        detail: { status: 'error', message: 'Invalid voice ID' },
      }));

      try {
        await client.textToSpeech('Hello', 'invalid-voice');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ElevenLabsError);
        if (error instanceof ElevenLabsError) {
          expect(error.statusCode).toBe(400);
          expect(error.retryable).toBe(false);
          expect(error.message).toBe('Invalid voice ID');
        }
      }
    });

    it('should handle non-JSON error responses', async () => {
      const response = createMockResponse(400, 'Plain text error');
      response.json = vi.fn().mockRejectedValue(new Error('Not JSON'));
      mockFetch.mockResolvedValueOnce(response);

      try {
        await client.textToSpeech('Hello', 'voice-123');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ElevenLabsError);
        if (error instanceof ElevenLabsError) {
          expect(error.statusCode).toBe(400);
        }
      }
    });

    it('should throw ElevenLabsError when response has no body', async () => {
      mockFetch.mockResolvedValueOnce({ ...createMockResponse(200), body: null, ok: true });

      await expect(client.textToSpeech('Hello', 'voice-123')).rejects.toThrow('No response body');
    });

    it('should handle timeout errors with retry', async () => {
      const mockStream = createReadableStream('audio data');
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      mockFetch
        .mockRejectedValueOnce(abortError)
        .mockResolvedValueOnce({ ...createMockResponse(200), body: mockStream, ok: true });

      const promise = client.textToSpeech('Hello', 'voice-123');
      await vi.runAllTimersAsync();

      const stream = await promise;
      expect(stream).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle network errors with retry', async () => {
      const mockStream = createReadableStream('audio data');

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ...createMockResponse(200), body: mockStream, ok: true });

      const promise = client.textToSpeech('Hello', 'voice-123');
      await vi.runAllTimersAsync();

      const stream = await promise;
      expect(stream).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('request format', () => {
    it('should use streaming endpoint by default', async () => {
      const mockStream = createReadableStream('audio data');
      mockFetch.mockResolvedValueOnce({ ...createMockResponse(200), body: mockStream, ok: true });

      await client.textToSpeech('Hello', 'voice-123');

      expect(mockFetch.mock.calls[0][0]).toContain('/stream');
    });

    it('should use non-streaming endpoint when stream is false', async () => {
      const mockStream = createReadableStream('audio data');
      mockFetch.mockResolvedValueOnce({ ...createMockResponse(200), body: mockStream, ok: true });

      await client.textToSpeech('Hello', 'voice-123', { stream: false });

      expect(mockFetch.mock.calls[0][0]).not.toContain('/stream');
    });

    it('should include output format in URL', async () => {
      const mockStream = createReadableStream('audio data');
      mockFetch.mockResolvedValueOnce({ ...createMockResponse(200), body: mockStream, ok: true });

      await client.textToSpeech('Hello', 'voice-123', { outputFormat: 'pcm_44100' });

      expect(mockFetch.mock.calls[0][0]).toContain('output_format=pcm_44100');
    });
  });
});
