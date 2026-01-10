import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSEService } from '../index.js';

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private listeners: Map<string, Set<(e: MessageEvent) => void>> = new Map();
  readyState: number = 0; // CONNECTING

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (e: MessageEvent) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (e: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.readyState = 2; // CLOSED
    this.listeners.clear();
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = 1; // OPEN
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  simulateMessage(type: string, data: object): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const event = new MessageEvent(type, {
        data: JSON.stringify(data),
      });
      listeners.forEach((listener) => listener(event));
    }
  }

  static reset(): void {
    MockEventSource.instances = [];
  }

  static getLastInstance(): MockEventSource | undefined {
    return MockEventSource.instances[MockEventSource.instances.length - 1];
  }
}

// Replace global EventSource with mock
vi.stubGlobal('EventSource', MockEventSource);

describe('SSEService', () => {
  let sseService: SSEService;

  beforeEach(() => {
    MockEventSource.reset();
    vi.useFakeTimers();
    sseService = new SSEService();
  });

  afterEach(() => {
    sseService.disconnect();
    vi.useRealTimers();
  });

  describe('connect', () => {
    it('should create EventSource with correct URL', () => {
      sseService.connect('game-123');

      const eventSource = MockEventSource.getLastInstance();
      expect(eventSource).toBeDefined();
      expect(eventSource!.url).toBe('/api/game/game-123/events');
    });

    it('should set connection state to connecting', () => {
      sseService.connect('game-123');

      expect(sseService.getConnectionState()).toBe('connecting');
    });

    it('should set connection state to connected on open', () => {
      sseService.connect('game-123');

      const eventSource = MockEventSource.getLastInstance();
      eventSource!.simulateOpen();

      expect(sseService.getConnectionState()).toBe('connected');
      expect(sseService.isConnected()).toBe(true);
    });

    it('should store game ID', () => {
      sseService.connect('game-123');

      expect(sseService.getGameId()).toBe('game-123');
    });

    it('should disconnect previous connection before new connection', () => {
      sseService.connect('game-1');
      const firstEventSource = MockEventSource.getLastInstance();

      sseService.connect('game-2');

      expect(firstEventSource!.readyState).toBe(2); // CLOSED
      expect(sseService.getGameId()).toBe('game-2');
    });
  });

  describe('disconnect', () => {
    it('should close EventSource', () => {
      sseService.connect('game-123');
      const eventSource = MockEventSource.getLastInstance();

      sseService.disconnect();

      expect(eventSource!.readyState).toBe(2); // CLOSED
    });

    it('should set connection state to disconnected', () => {
      sseService.connect('game-123');

      sseService.disconnect();

      expect(sseService.getConnectionState()).toBe('disconnected');
      expect(sseService.isConnected()).toBe(false);
    });

    it('should clear game ID', () => {
      sseService.connect('game-123');

      sseService.disconnect();

      expect(sseService.getGameId()).toBeNull();
    });

    it('should cancel pending reconnect', () => {
      sseService.connect('game-123');
      const eventSource = MockEventSource.getLastInstance();
      eventSource!.simulateError();

      sseService.disconnect();

      // Advance time past reconnect delay
      vi.advanceTimersByTime(5000);

      // Should still be disconnected, not reconnecting
      expect(sseService.getConnectionState()).toBe('disconnected');
      expect(MockEventSource.instances.length).toBe(1);
    });
  });

  describe('on', () => {
    it('should register event handler', () => {
      const handler = vi.fn();

      sseService.on('generation_complete', handler);
      sseService.connect('game-123');

      const eventSource = MockEventSource.getLastInstance();
      eventSource!.simulateMessage('generation_complete', {
        type: 'generation_complete',
        generationId: 'gen-1',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'generation_complete',
          generationId: 'gen-1',
          content: 'Hello',
        })
      );
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();

      const unsubscribe = sseService.on('generation_complete', handler);
      sseService.connect('game-123');

      unsubscribe();

      const eventSource = MockEventSource.getLastInstance();
      eventSource!.simulateMessage('generation_complete', {
        type: 'generation_complete',
        generationId: 'gen-1',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple handlers for same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      sseService.on('heartbeat', handler1);
      sseService.on('heartbeat', handler2);
      sseService.connect('game-123');

      const eventSource = MockEventSource.getLastInstance();
      eventSource!.simulateMessage('heartbeat', {
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
      });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('off', () => {
    it('should remove specific handler', () => {
      const handler = vi.fn();

      sseService.on('generation_started', handler);
      sseService.off('generation_started', handler);
      sseService.connect('game-123');

      const eventSource = MockEventSource.getLastInstance();
      eventSource!.simulateMessage('generation_started', {
        type: 'generation_started',
        generationId: 'gen-1',
        timestamp: new Date().toISOString(),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should not affect other handlers for same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      sseService.on('state_changed', handler1);
      sseService.on('state_changed', handler2);
      sseService.off('state_changed', handler1);
      sseService.connect('game-123');

      const eventSource = MockEventSource.getLastInstance();
      eventSource!.simulateMessage('state_changed', {
        type: 'state_changed',
        previousState: 'idle',
        newState: 'active',
        timestamp: new Date().toISOString(),
      });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('offAll', () => {
    it('should remove all handlers for specific event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      sseService.on('tts_complete', handler1);
      sseService.on('tts_complete', handler2);
      sseService.offAll('tts_complete');
      sseService.connect('game-123');

      const eventSource = MockEventSource.getLastInstance();
      eventSource!.simulateMessage('tts_complete', {
        type: 'tts_complete',
        requestId: 'req-1',
        timestamp: new Date().toISOString(),
      });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should remove all handlers when called without arguments', () => {
      const completedHandler = vi.fn();
      const heartbeatHandler = vi.fn();

      sseService.on('generation_complete', completedHandler);
      sseService.on('heartbeat', heartbeatHandler);
      sseService.offAll();
      sseService.connect('game-123');

      const eventSource = MockEventSource.getLastInstance();
      eventSource!.simulateMessage('generation_complete', {
        type: 'generation_complete',
        generationId: 'gen-1',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      });
      eventSource!.simulateMessage('heartbeat', {
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
      });

      expect(completedHandler).not.toHaveBeenCalled();
      expect(heartbeatHandler).not.toHaveBeenCalled();
    });
  });

  describe('auto-reconnect', () => {
    it('should attempt to reconnect on error', () => {
      sseService.connect('game-123');
      const eventSource = MockEventSource.getLastInstance();
      eventSource!.simulateError();

      expect(sseService.getConnectionState()).toBe('reconnecting');

      // Advance past reconnect delay
      vi.advanceTimersByTime(1000);

      expect(MockEventSource.instances.length).toBe(2);
      expect(sseService.getConnectionState()).toBe('connecting');
    });

    it('should use exponential backoff for reconnection', () => {
      sseService = new SSEService({
        reconnectDelay: 1000,
        reconnectBackoff: 2,
        maxReconnectDelay: 10000,
      });

      sseService.connect('game-123');

      // First error - should wait 1000ms
      MockEventSource.getLastInstance()!.simulateError();
      vi.advanceTimersByTime(999);
      expect(MockEventSource.instances.length).toBe(1);
      vi.advanceTimersByTime(1);
      expect(MockEventSource.instances.length).toBe(2);

      // Second error - should wait 2000ms
      MockEventSource.getLastInstance()!.simulateError();
      vi.advanceTimersByTime(1999);
      expect(MockEventSource.instances.length).toBe(2);
      vi.advanceTimersByTime(1);
      expect(MockEventSource.instances.length).toBe(3);

      // Third error - should wait 4000ms
      MockEventSource.getLastInstance()!.simulateError();
      vi.advanceTimersByTime(3999);
      expect(MockEventSource.instances.length).toBe(3);
      vi.advanceTimersByTime(1);
      expect(MockEventSource.instances.length).toBe(4);
    });

    it('should cap reconnect delay at maxReconnectDelay', () => {
      sseService = new SSEService({
        reconnectDelay: 1000,
        reconnectBackoff: 10,
        maxReconnectDelay: 5000,
      });

      sseService.connect('game-123');

      // First error - should wait 1000ms
      MockEventSource.getLastInstance()!.simulateError();
      vi.advanceTimersByTime(1000);
      expect(MockEventSource.instances.length).toBe(2);

      // Second error - would be 10000ms but capped at 5000ms
      MockEventSource.getLastInstance()!.simulateError();
      vi.advanceTimersByTime(5000);
      expect(MockEventSource.instances.length).toBe(3);
    });

    it('should reset reconnect attempts on successful connection', () => {
      sseService = new SSEService({
        reconnectDelay: 1000,
        reconnectBackoff: 2,
      });

      sseService.connect('game-123');
      MockEventSource.getLastInstance()!.simulateError();
      vi.advanceTimersByTime(1000);

      // Second attempt connects successfully
      MockEventSource.getLastInstance()!.simulateOpen();

      // Another error should use initial delay (1000ms), not 2000ms
      MockEventSource.getLastInstance()!.simulateError();
      vi.advanceTimersByTime(1000);
      expect(MockEventSource.instances.length).toBe(3);
    });
  });

  describe('error handling', () => {
    it('should catch and log handler errors without crashing', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      sseService.on('heartbeat', errorHandler);
      sseService.on('heartbeat', normalHandler);
      sseService.connect('game-123');

      const eventSource = MockEventSource.getLastInstance();
      eventSource!.simulateMessage('heartbeat', {
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
      });

      expect(consoleError).toHaveBeenCalledWith(
        '[SSE] Handler error for heartbeat:',
        expect.any(Error)
      );
      expect(normalHandler).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('should handle malformed JSON gracefully', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const handler = vi.fn();

      sseService.on('heartbeat', handler);
      sseService.connect('game-123');

      const eventSource = MockEventSource.getLastInstance();
      const listeners = (eventSource as any).listeners.get('heartbeat');
      if (listeners) {
        const event = new MessageEvent('heartbeat', {
          data: 'not valid json',
        });
        listeners.forEach((listener: (e: MessageEvent) => void) => listener(event));
      }

      expect(consoleError).toHaveBeenCalledWith(
        '[SSE] Failed to parse event data for heartbeat:',
        expect.any(Error)
      );
      expect(handler).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });
});
