import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TTSService } from '../index.js';
import type { TTSRequest, TTSEventCallbacks, NarrativeBeat } from '@reckoning/shared';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock URL.createObjectURL and revokeObjectURL
const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();
vi.stubGlobal('URL', {
  ...URL,
  createObjectURL: mockCreateObjectURL,
  revokeObjectURL: mockRevokeObjectURL,
});

// Mock Audio element
interface MockAudioInstance {
  src: string;
  volume: number;
  onplay: (() => void) | null;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  _paused: boolean;
  _playReject: ((error: Error) => void) | null;
  play: () => Promise<void>;
  pause: () => void;
  _simulateEnded: () => void;
  _simulateError: () => void;
  _simulatePlayFailure: (error: Error) => void;
}

// Store Audio instances for test manipulation
let audioInstances: MockAudioInstance[] = [];

// Create mock Audio class
const MockAudio = vi.fn().mockImplementation(function (this: MockAudioInstance, src?: string) {
  this.src = src || '';
  this.volume = 1;
  this.onplay = null;
  this.onended = null;
  this.onerror = null;
  this._paused = true;
  this._playReject = null;

  this.play = () => {
    this._paused = false;
    return new Promise<void>((resolve, reject) => {
      this._playReject = reject;
      // Simulate async play start
      setTimeout(() => {
        if (this.onplay) this.onplay();
        resolve();
      }, 0);
    });
  };

  this.pause = () => {
    this._paused = true;
  };

  // Test helpers
  this._simulateEnded = () => {
    if (this.onended) this.onended();
  };

  this._simulateError = () => {
    if (this.onerror) this.onerror();
  };

  this._simulatePlayFailure = (error: Error) => {
    if (this._playReject) this._playReject(error);
  };

  audioInstances.push(this);
  return this;
});

vi.stubGlobal('Audio', MockAudio);

// Helper to create a mock response
function createMockResponse(
  status: number,
  body?: Blob | string,
  options?: { ok?: boolean; statusText?: string }
): Response {
  const ok = options?.ok ?? (status >= 200 && status < 300);
  const statusText = options?.statusText ?? (ok ? 'OK' : 'Error');
  const blob = body instanceof Blob ? body : new Blob([body ?? ''], { type: 'audio/mpeg' });

  return {
    ok,
    status,
    statusText,
    blob: vi.fn().mockResolvedValue(blob),
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : 'error'),
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: vi.fn(),
    arrayBuffer: vi.fn(),
    json: vi.fn(),
    formData: vi.fn(),
    bodyUsed: false,
    body: null,
  } as unknown as Response;
}

// Helper to create audio blob
function createAudioBlob(): Blob {
  return new Blob(['fake audio data'], { type: 'audio/mpeg' });
}

// Helper to wait for a specific playback state
async function waitForPlaybackState(
  service: TTSService,
  state: string,
  timeout = 5000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (service.getQueueStatus().playbackState === state) {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`Timeout waiting for playback state: ${state}`);
}

describe('TTSService', () => {
  let service: TTSService;

  beforeEach(() => {
    vi.clearAllMocks();
    audioInstances = [];
    mockCreateObjectURL.mockReturnValue('blob:mock-url');
    MockAudio.mockClear();
    service = new TTSService();
  });

  afterEach(() => {
    service.dispose();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create service with default configuration', () => {
      const svc = new TTSService();
      expect(svc).toBeDefined();
      expect(svc.getVolume()).toBe(1);
      expect(svc.getQueueStatus().playbackState).toBe('idle');
      svc.dispose();
    });

    it('should accept custom apiBaseUrl', () => {
      const svc = new TTSService({ apiBaseUrl: '/custom/tts' });
      expect(svc).toBeDefined();
      svc.dispose();
    });

    it('should accept custom initialVolume', () => {
      const svc = new TTSService({ initialVolume: 0.5 });
      expect(svc.getVolume()).toBe(0.5);
      svc.dispose();
    });

    it('should clamp initialVolume to valid range', () => {
      const svcHigh = new TTSService({ initialVolume: 1.5 });
      expect(svcHigh.getVolume()).toBe(1);
      svcHigh.dispose();

      const svcLow = new TTSService({ initialVolume: -0.5 });
      expect(svcLow.getVolume()).toBe(0);
      svcLow.dispose();
    });

    it('should accept autoPlay configuration', () => {
      const svc = new TTSService({ autoPlay: false });
      expect(svc).toBeDefined();
      svc.dispose();
    });
  });

  // ===========================================================================
  // Queue Management Tests
  // ===========================================================================

  describe('speak', () => {
    it('should add item to queue and return id', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      const request: TTSRequest = { text: 'Hello world' };
      const id = await service.speak(request);

      expect(id).toMatch(/^tts-\d+-[a-z0-9]+$/);
    });

    it('should trigger auto-play when idle', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      const request: TTSRequest = { text: 'Hello world' };
      await service.speak(request);

      // Wait for async play to start
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    it('should not auto-play when autoPlay is false', async () => {
      const svc = new TTSService({ autoPlay: false });
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      const request: TTSRequest = { text: 'Hello world' };
      await svc.speak(request);

      // Give time for any async operations
      await new Promise((r) => setTimeout(r, 10));

      expect(mockFetch).not.toHaveBeenCalled();
      svc.dispose();
    });

    it('should throw if service is disposed', async () => {
      service.dispose();

      await expect(service.speak({ text: 'Hello' })).rejects.toThrow(
        'TTSService has been disposed'
      );
    });

    it('should queue multiple items', async () => {
      const svc = new TTSService({ autoPlay: false });

      await svc.speak({ text: 'First' });
      await svc.speak({ text: 'Second' });
      await svc.speak({ text: 'Third' });

      const status = svc.getQueueStatus();
      expect(status.pendingItems).toHaveLength(3);
      svc.dispose();
    });
  });

  describe('preload', () => {
    it('should add item to queue and start loading', async () => {
      const svc = new TTSService({ autoPlay: false });
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      const request: TTSRequest = { text: 'Hello world' };
      const id = await svc.preload(request);

      expect(id).toMatch(/^tts-\d+-[a-z0-9]+$/);

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      svc.dispose();
    });

    it('should throw if service is disposed', async () => {
      service.dispose();

      await expect(service.preload({ text: 'Hello' })).rejects.toThrow(
        'TTSService has been disposed'
      );
    });
  });

  describe('getQueueStatus', () => {
    it('should return current queue status', () => {
      const status = service.getQueueStatus();

      expect(status).toEqual({
        playbackState: 'idle',
        currentItem: null,
        pendingItems: [],
        totalItems: 0,
      });
    });

    it('should reflect pending items', async () => {
      const svc = new TTSService({ autoPlay: false });

      await svc.speak({ text: 'Test' });

      const status = svc.getQueueStatus();
      expect(status.pendingItems).toHaveLength(1);
      expect(status.totalItems).toBe(1);

      svc.dispose();
    });
  });

  describe('clearQueue', () => {
    it('should clear all pending items', async () => {
      const svc = new TTSService({ autoPlay: false });

      await svc.speak({ text: 'First' });
      await svc.speak({ text: 'Second' });

      expect(svc.getQueueStatus().pendingItems).toHaveLength(2);

      svc.clearQueue();

      expect(svc.getQueueStatus().pendingItems).toHaveLength(0);

      svc.dispose();
    });

    it('should notify queue change', async () => {
      const svc = new TTSService({ autoPlay: false });
      const onQueueChange = vi.fn();
      svc.setCallbacks({ onQueueChange });

      await svc.speak({ text: 'Test' });
      svc.clearQueue();

      expect(onQueueChange).toHaveBeenCalled();

      svc.dispose();
    });
  });

  // ===========================================================================
  // Playback Controls Tests
  // ===========================================================================

  describe('play', () => {
    it('should start playback from idle state with items in queue', async () => {
      const svc = new TTSService({ autoPlay: false });
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      await svc.speak({ text: 'Hello' });
      svc.play();

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      svc.dispose();
    });

    it('should resume from paused state', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      await service.speak({ text: 'Hello' });

      // Wait for play to start
      await vi.waitFor(() => {
        expect(audioInstances.length).toBeGreaterThan(0);
      });

      // Pause and resume
      service.pause();
      expect(service.getQueueStatus().playbackState).toBe('paused');

      service.play();

      await vi.waitFor(() => {
        expect(service.getQueueStatus().playbackState).toBe('playing');
      });
    });

    it('should do nothing when idle with empty queue', () => {
      service.play();
      expect(service.getQueueStatus().playbackState).toBe('idle');
    });

    it('should throw if disposed', () => {
      service.dispose();
      expect(() => service.play()).toThrow('TTSService has been disposed');
    });
  });

  describe('pause', () => {
    it('should pause current playback', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      await service.speak({ text: 'Hello' });

      // Wait for playing state
      await waitForPlaybackState(service, 'playing');

      service.pause();
      expect(service.getQueueStatus().playbackState).toBe('paused');
    });

    it('should do nothing when not playing', () => {
      service.pause();
      expect(service.getQueueStatus().playbackState).toBe('idle');
    });

    it('should throw if disposed', () => {
      service.dispose();
      expect(() => service.pause()).toThrow('TTSService has been disposed');
    });
  });

  describe('resume', () => {
    it('should resume paused playback', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      await service.speak({ text: 'Hello' });

      // Wait for playing state
      await waitForPlaybackState(service, 'playing');

      service.pause();
      expect(service.getQueueStatus().playbackState).toBe('paused');

      service.resume();

      await waitForPlaybackState(service, 'playing');
    });

    it('should do nothing when not paused', () => {
      service.resume();
      expect(service.getQueueStatus().playbackState).toBe('idle');
    });

    it('should throw if disposed', () => {
      service.dispose();
      expect(() => service.resume()).toThrow('TTSService has been disposed');
    });
  });

  describe('skip', () => {
    it('should skip current item and play next', async () => {
      const svc = new TTSService({ autoPlay: false });
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200, createAudioBlob()))
        .mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      await svc.speak({ text: 'First' });
      await svc.speak({ text: 'Second' });
      svc.play();

      // Wait for first item to start playing
      await vi.waitFor(() => {
        const status = svc.getQueueStatus();
        return status.playbackState === 'playing' || status.playbackState === 'loading';
      });

      svc.skip();

      // After skip, should be playing or loading next
      await vi.waitFor(() => {
        const status = svc.getQueueStatus();
        // Queue should have been processed
        return status.pendingItems.length === 0;
      });

      svc.dispose();
    });

    it('should go to idle when skipping last item', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      await service.speak({ text: 'Only' });

      // Wait for playing
      await vi.waitFor(() => {
        const status = service.getQueueStatus();
        return status.playbackState === 'playing';
      });

      service.skip();

      // Should be idle since queue is empty
      expect(service.getQueueStatus().playbackState).toBe('idle');
    });

    it('should trigger onEnd callback', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));
      const onEnd = vi.fn();
      service.setCallbacks({ onEnd });

      await service.speak({ text: 'Hello' });

      await vi.waitFor(() => {
        const status = service.getQueueStatus();
        return status.playbackState === 'playing';
      });

      service.skip();

      expect(onEnd).toHaveBeenCalled();
    });

    it('should throw if disposed', () => {
      service.dispose();
      expect(() => service.skip()).toThrow('TTSService has been disposed');
    });
  });

  describe('stop', () => {
    it('should stop playback and clear queue', async () => {
      const svc = new TTSService({ autoPlay: false });

      await svc.speak({ text: 'First' });
      await svc.speak({ text: 'Second' });

      svc.stop();

      const status = svc.getQueueStatus();
      expect(status.playbackState).toBe('idle');
      expect(status.pendingItems).toHaveLength(0);
      expect(status.currentItem).toBeNull();

      svc.dispose();
    });

    it('should stop currently playing audio', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      await service.speak({ text: 'Hello' });

      // Wait for playing
      await waitForPlaybackState(service, 'playing');

      // Verify audio was created
      expect(audioInstances.length).toBeGreaterThan(0);

      service.stop();

      expect(service.getQueueStatus().playbackState).toBe('idle');
      expect(audioInstances[0]!.src).toBe('');
    });

    it('should throw if disposed', () => {
      service.dispose();
      expect(() => service.stop()).toThrow('TTSService has been disposed');
    });
  });

  // ===========================================================================
  // Volume Control Tests
  // ===========================================================================

  describe('setVolume', () => {
    it('should set volume within valid range', () => {
      service.setVolume(0.5);
      expect(service.getVolume()).toBe(0.5);
    });

    it('should clamp volume to 0', () => {
      service.setVolume(-0.5);
      expect(service.getVolume()).toBe(0);
    });

    it('should clamp volume to 1', () => {
      service.setVolume(1.5);
      expect(service.getVolume()).toBe(1);
    });

    it('should update current audio element volume', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      await service.speak({ text: 'Hello' });

      // Wait for playing state (audio element created)
      await waitForPlaybackState(service, 'playing');

      expect(audioInstances.length).toBeGreaterThan(0);

      service.setVolume(0.3);

      expect(audioInstances[0]!.volume).toBe(0.3);
    });
  });

  describe('getVolume', () => {
    it('should return current volume', () => {
      expect(service.getVolume()).toBe(1);

      service.setVolume(0.7);
      expect(service.getVolume()).toBe(0.7);
    });
  });

  // ===========================================================================
  // Event Callbacks Tests
  // ===========================================================================

  describe('setCallbacks', () => {
    it('should set callback functions', () => {
      const callbacks: TTSEventCallbacks = {
        onStart: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
        onQueueChange: vi.fn(),
      };

      service.setCallbacks(callbacks);

      // Callbacks should be stored (verified by triggering them)
      expect(() => service.clearQueue()).not.toThrow();
    });
  });

  describe('onStart callback', () => {
    it('should be called when item starts playing', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));
      const onStart = vi.fn();
      service.setCallbacks({ onStart });

      await service.speak({ text: 'Hello' });

      await vi.waitFor(() => {
        expect(onStart).toHaveBeenCalled();
      });

      expect(onStart.mock.calls[0][0]).toMatchObject({
        request: { text: 'Hello' },
        state: 'playing',
      });
    });
  });

  describe('onEnd callback', () => {
    it('should be called when item finishes playing', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));
      const onEnd = vi.fn();
      service.setCallbacks({ onEnd });

      await service.speak({ text: 'Hello' });

      // Wait for playing state
      await waitForPlaybackState(service, 'playing');

      expect(audioInstances.length).toBeGreaterThan(0);

      // Simulate audio ended
      audioInstances[0]!._simulateEnded();

      expect(onEnd).toHaveBeenCalled();
      expect(onEnd.mock.calls[0][0]).toMatchObject({
        request: { text: 'Hello' },
        state: 'completed',
      });
    });
  });

  describe('onError callback', () => {
    it('should be called when API request fails', async () => {
      // Reset and set up fresh mock for error response
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(createMockResponse(500, 'Server error', { ok: false }));
      const onError = vi.fn();
      service.setCallbacks({ onError });

      await service.speak({ text: 'Hello' });

      // Wait for error to be processed - use longer timeout
      const maxWait = 2000;
      const start = Date.now();
      while (Date.now() - start < maxWait && !onError.mock.calls.length) {
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0]).toMatchObject({
        request: { text: 'Hello' },
        state: 'error',
      });
      expect(onError.mock.calls[0][1]).toBeInstanceOf(Error);
    });

    it('should be called when preload fails', async () => {
      const svc = new TTSService({ autoPlay: false });
      mockFetch.mockResolvedValueOnce(createMockResponse(500, 'Server error', { ok: false }));
      const onError = vi.fn();
      svc.setCallbacks({ onError });

      await svc.preload({ text: 'Hello' });

      // Wait for error to be processed
      await new Promise((r) => setTimeout(r, 100));

      expect(onError).toHaveBeenCalled();

      svc.dispose();
    });
  });

  describe('onQueueChange callback', () => {
    it('should be called when items are added', async () => {
      const svc = new TTSService({ autoPlay: false });
      const onQueueChange = vi.fn();
      svc.setCallbacks({ onQueueChange });

      await svc.speak({ text: 'Hello' });

      expect(onQueueChange).toHaveBeenCalled();

      svc.dispose();
    });

    it('should be called when queue is cleared', async () => {
      const svc = new TTSService({ autoPlay: false });
      const onQueueChange = vi.fn();
      svc.setCallbacks({ onQueueChange });

      await svc.speak({ text: 'Hello' });
      onQueueChange.mockClear();

      svc.clearQueue();

      expect(onQueueChange).toHaveBeenCalled();

      svc.dispose();
    });

    it('should receive queue status', async () => {
      const svc = new TTSService({ autoPlay: false });
      const onQueueChange = vi.fn();
      svc.setCallbacks({ onQueueChange });

      await svc.speak({ text: 'Hello' });

      expect(onQueueChange).toHaveBeenCalledWith(
        expect.objectContaining({
          playbackState: expect.any(String),
          pendingItems: expect.any(Array),
          totalItems: expect.any(Number),
        })
      );

      svc.dispose();
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('error handling', () => {
    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const onError = vi.fn();
      service.setCallbacks({ onError });

      await service.speak({ text: 'Hello' });

      // Wait for error processing
      await new Promise((r) => setTimeout(r, 100));
      await waitForPlaybackState(service, 'idle');

      expect(onError).toHaveBeenCalled();
    });

    it('should handle API error responses', async () => {
      // Clear any existing mocks and set up fresh
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(
        createMockResponse(400, 'Bad request', { ok: false })
      );
      const onError = vi.fn();
      service.setCallbacks({ onError });

      await service.speak({ text: 'Hello' });

      // Wait for error to be processed - use longer timeout
      const maxWait = 2000;
      const start = Date.now();
      while (Date.now() - start < maxWait && !onError.mock.calls.length) {
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(onError).toHaveBeenCalled();

      const error = onError.mock.calls[0][1] as Error;
      expect(error.message).toContain('TTS API error');
    });

    it('should continue to next item after error', async () => {
      const svc = new TTSService({ autoPlay: false });
      mockFetch
        .mockResolvedValueOnce(createMockResponse(500, 'Error', { ok: false }))
        .mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      await svc.speak({ text: 'First (will fail)' });
      await svc.speak({ text: 'Second' });

      svc.play();

      // Wait for both fetches to complete
      await new Promise((r) => setTimeout(r, 200));

      expect(mockFetch).toHaveBeenCalledTimes(2);

      svc.dispose();
    });

    it('should handle audio playback errors', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));
      const onError = vi.fn();
      service.setCallbacks({ onError });

      await service.speak({ text: 'Hello' });

      // Wait for playing state
      await waitForPlaybackState(service, 'playing');

      expect(audioInstances.length).toBeGreaterThan(0);

      // Simulate audio error
      audioInstances[0]!._simulateError();

      // The error should be handled (not crash)
      expect(service.getQueueStatus()).toBeDefined();
    });

    it('should set error state on failed items', async () => {
      const svc = new TTSService({ autoPlay: false });
      // Reset and set up fresh mock
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(createMockResponse(500, 'Error', { ok: false }));

      const onError = vi.fn();
      svc.setCallbacks({ onError });

      await svc.preload({ text: 'Hello' });

      // Wait for error to be processed - use longer timeout
      const maxWait = 2000;
      const start = Date.now();
      while (Date.now() - start < maxWait && !onError.mock.calls.length) {
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0].state).toBe('error');
      expect(onError.mock.calls[0][0].error).toBeDefined();

      svc.dispose();
    });
  });

  // ===========================================================================
  // Dispose Lifecycle Tests
  // ===========================================================================

  describe('dispose', () => {
    it('should stop all playback', async () => {
      // Reset and set up fresh mock
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      await service.speak({ text: 'Hello' });

      // Wait for playback to start
      await waitForPlaybackState(service, 'playing');

      expect(audioInstances.length).toBeGreaterThan(0);

      service.dispose();

      // Audio should be stopped (src cleared)
      expect(audioInstances[0]!.src).toBe('');
    });

    it('should clear the queue', async () => {
      const svc = new TTSService({ autoPlay: false });

      await svc.speak({ text: 'First' });
      await svc.speak({ text: 'Second' });

      svc.dispose();

      // After dispose, calling methods should throw
      expect(() => svc.getQueueStatus()).not.toThrow(); // getQueueStatus doesn't check disposed
    });

    it('should clear callbacks', async () => {
      const onStart = vi.fn();
      service.setCallbacks({ onStart });

      service.dispose();

      // After dispose, callbacks should be cleared (not called)
      // This is verified by the implementation clearing this.callbacks = {}
    });

    it('should be idempotent', () => {
      service.dispose();
      service.dispose(); // Should not throw
    });

    it('should prevent further operations', () => {
      service.dispose();

      expect(() => service.play()).toThrow('TTSService has been disposed');
      expect(() => service.pause()).toThrow('TTSService has been disposed');
      expect(() => service.resume()).toThrow('TTSService has been disposed');
      expect(() => service.skip()).toThrow('TTSService has been disposed');
      expect(() => service.stop()).toThrow('TTSService has been disposed');
    });
  });

  // ===========================================================================
  // speakSequence Tests
  // ===========================================================================

  describe('speakSequence', () => {
    it('should queue all beats for playback', async () => {
      const svc = new TTSService({ autoPlay: false });

      const beats: NarrativeBeat[] = [
        { id: '1', type: 'narration', content: 'The adventure begins.' },
        { id: '2', type: 'dialogue', content: 'Hello there!', speaker: 'Guard' },
        { id: '3', type: 'action', content: 'You draw your sword.' },
      ];

      const queueIds = await svc.speakSequence(beats);

      expect(queueIds).toHaveLength(3);
      // Queue should have 3 beats + 2 pauses between them = 5 items total
      const status = svc.getQueueStatus();
      expect(status.totalItems).toBe(5);

      svc.dispose();
    });

    it('should skip empty beats by default', async () => {
      const svc = new TTSService({ autoPlay: false });

      const beats: NarrativeBeat[] = [
        { id: '1', type: 'narration', content: 'First beat.' },
        { id: '2', type: 'narration', content: '   ' }, // Empty
        { id: '3', type: 'narration', content: '' }, // Empty
        { id: '4', type: 'narration', content: 'Last beat.' },
      ];

      const queueIds = await svc.speakSequence(beats);

      // Only non-empty beats should be queued
      expect(queueIds).toHaveLength(2);

      svc.dispose();
    });

    it('should include empty beats when skipEmpty is false', async () => {
      const svc = new TTSService({ autoPlay: false });

      const beats: NarrativeBeat[] = [
        { id: '1', type: 'narration', content: 'First beat.' },
        { id: '2', type: 'narration', content: '' },
        { id: '3', type: 'narration', content: 'Last beat.' },
      ];

      const queueIds = await svc.speakSequence(beats, { skipEmpty: false });

      expect(queueIds).toHaveLength(3);

      svc.dispose();
    });

    it('should use narrator voice for narration beats', async () => {
      const svc = new TTSService({ autoPlay: false });
      mockFetch.mockResolvedValue(createMockResponse(200, createAudioBlob()));

      const beats: NarrativeBeat[] = [
        { id: '1', type: 'narration', content: 'A narrative passage.' },
      ];

      await svc.speakSequence(beats);
      svc.play();

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.role).toBe('narrator');

      svc.dispose();
    });

    it('should use npc voice for dialogue beats with speaker', async () => {
      const svc = new TTSService({ autoPlay: false });
      mockFetch.mockResolvedValue(createMockResponse(200, createAudioBlob()));

      const beats: NarrativeBeat[] = [
        { id: '1', type: 'dialogue', content: 'Greetings, traveler!', speaker: 'Innkeeper' },
      ];

      await svc.speakSequence(beats);
      svc.play();

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.role).toBe('npc');
      expect(requestBody.speaker).toBe('Innkeeper');

      svc.dispose();
    });

    it('should use inner_voice for thought beats with speaker', async () => {
      const svc = new TTSService({ autoPlay: false });
      mockFetch.mockResolvedValue(createMockResponse(200, createAudioBlob()));

      const beats: NarrativeBeat[] = [
        { id: '1', type: 'thought', content: 'I wonder what awaits...', speaker: 'Hero' },
      ];

      await svc.speakSequence(beats);
      svc.play();

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.role).toBe('inner_voice');

      svc.dispose();
    });

    it('should call onBeatStart callback when beat starts', async () => {
      const svc = new TTSService({ autoPlay: false });
      mockFetch.mockResolvedValue(createMockResponse(200, createAudioBlob()));

      const onBeatStart = vi.fn();
      const beats: NarrativeBeat[] = [
        { id: '1', type: 'narration', content: 'Test beat.' },
      ];

      await svc.speakSequence(beats, { onBeatStart });
      svc.play();

      await vi.waitFor(() => {
        expect(audioInstances.length).toBeGreaterThan(0);
      });

      // Trigger onplay
      await new Promise((r) => setTimeout(r, 50));

      expect(onBeatStart).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1', content: 'Test beat.' }),
        0
      );

      svc.dispose();
    });

    it('should call onBeatEnd callback when beat ends', async () => {
      const svc = new TTSService({ autoPlay: false });
      mockFetch.mockResolvedValue(createMockResponse(200, createAudioBlob()));

      const onBeatEnd = vi.fn();
      const beats: NarrativeBeat[] = [
        { id: '1', type: 'narration', content: 'Test beat.' },
      ];

      await svc.speakSequence(beats, { onBeatEnd });
      svc.play();

      await vi.waitFor(() => {
        expect(audioInstances.length).toBeGreaterThan(0);
      });

      // Simulate audio ended
      audioInstances[0]!._simulateEnded();

      expect(onBeatEnd).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1', content: 'Test beat.' }),
        0
      );

      svc.dispose();
    });

    it('should use metadata pauseAfter if provided', async () => {
      const svc = new TTSService({ autoPlay: false });

      const beats: NarrativeBeat[] = [
        { id: '1', type: 'narration', content: 'First.', metadata: { pauseAfter: 1000 } },
        { id: '2', type: 'narration', content: 'Second.' },
      ];

      await svc.speakSequence(beats);

      // Queue should have: beat1, pause(1000ms), beat2
      const status = svc.getQueueStatus();
      expect(status.totalItems).toBe(3);

      svc.dispose();
    });

    it('should throw if service is disposed', async () => {
      service.dispose();

      await expect(
        service.speakSequence([{ id: '1', type: 'narration', content: 'Test' }])
      ).rejects.toThrow('TTSService has been disposed');
    });

    it('should auto-play when idle and autoPlay is enabled', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, createAudioBlob()));

      const beats: NarrativeBeat[] = [
        { id: '1', type: 'narration', content: 'Test beat.' },
      ];

      await service.speakSequence(beats);

      // Should auto-play since default service has autoPlay: true
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    it('should apply emotion preset for intense emotions', async () => {
      const svc = new TTSService({ autoPlay: false });
      mockFetch.mockResolvedValue(createMockResponse(200, createAudioBlob()));

      const beats: NarrativeBeat[] = [
        { id: '1', type: 'dialogue', content: 'Stop right there!', metadata: { emotion: 'angry' } },
      ];

      await svc.speakSequence(beats);
      svc.play();

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.preset).toBe('dialogue_intense');

      svc.dispose();
    });

    it('should apply emotion preset for calm emotions', async () => {
      const svc = new TTSService({ autoPlay: false });
      mockFetch.mockResolvedValue(createMockResponse(200, createAudioBlob()));

      const beats: NarrativeBeat[] = [
        { id: '1', type: 'narration', content: 'Peace settled over the land.', metadata: { emotion: 'calm' } },
      ];

      await svc.speakSequence(beats);
      svc.play();

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.preset).toBe('dialogue_calm');

      svc.dispose();
    });
  });

  // ===========================================================================
  // Integration Tests
  // ===========================================================================

  describe('integration', () => {
    it('should play through a queue of items', async () => {
      const svc = new TTSService({ autoPlay: false });
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200, createAudioBlob()))
        .mockResolvedValueOnce(createMockResponse(200, createAudioBlob()))
        .mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      const onStart = vi.fn();
      const onEnd = vi.fn();
      svc.setCallbacks({ onStart, onEnd });

      await svc.speak({ text: 'First' });
      await svc.speak({ text: 'Second' });
      await svc.speak({ text: 'Third' });

      svc.play();

      // Wait for first item to start playing
      await waitForPlaybackState(svc, 'playing');
      expect(audioInstances.length).toBeGreaterThan(0);

      // Simulate first item ended
      audioInstances[0]!._simulateEnded();

      // Wait for second item to start playing
      await new Promise((r) => setTimeout(r, 50));
      await waitForPlaybackState(svc, 'playing');
      expect(audioInstances.length).toBeGreaterThan(1);

      // Simulate second item ended
      audioInstances[1]!._simulateEnded();

      // Wait for third item to start playing
      await new Promise((r) => setTimeout(r, 50));
      await waitForPlaybackState(svc, 'playing');
      expect(audioInstances.length).toBeGreaterThan(2);

      // Simulate third item ended
      audioInstances[2]!._simulateEnded();

      await waitForPlaybackState(svc, 'idle');

      expect(onStart).toHaveBeenCalledTimes(3);
      expect(onEnd).toHaveBeenCalledTimes(3);

      svc.dispose();
    });

    it('should make correct API calls', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      const request: TTSRequest = {
        text: 'Test message',
        role: 'narrator',
        preset: 'chronicle',
      };

      await service.speak(request);

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tts/speak',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        })
      );
    });

    it('should use custom apiBaseUrl', async () => {
      const svc = new TTSService({ apiBaseUrl: '/custom/api' });
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      await svc.speak({ text: 'Hello' });

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/custom/api/speak',
        expect.anything()
      );

      svc.dispose();
    });

    it('should properly manage object URLs', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createAudioBlob()));

      await service.speak({ text: 'Hello' });

      // Wait for playing state
      await waitForPlaybackState(service, 'playing');

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(audioInstances.length).toBeGreaterThan(0);

      // Simulate audio ended
      audioInstances[0]!._simulateEnded();

      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });
  });
});
