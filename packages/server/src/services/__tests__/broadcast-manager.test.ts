import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BroadcastManager,
  setupSSEResponse,
  formatSSEMessage,
} from '../sse/broadcast-manager.js';
import type { SSEEvent } from '../sse/types.js';
import type { FastifyReply } from 'fastify';

/**
 * Create a mock Fastify reply for testing
 */
function createMockReply(): FastifyReply & {
  raw: {
    writable: boolean;
    setHeader: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };
} {
  const closeHandlers: Array<() => void> = [];

  const raw = {
    writable: true,
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      if (event === 'close') {
        closeHandlers.push(handler);
      }
    }),
  };

  return {
    raw,
    // Helper to simulate close
    _simulateClose: () => {
      closeHandlers.forEach((h) => h());
    },
  } as unknown as FastifyReply & {
    raw: typeof raw;
    _simulateClose: () => void;
  };
}

describe('BroadcastManager', () => {
  let manager: BroadcastManager;

  beforeEach(() => {
    manager = new BroadcastManager({ heartbeatIntervalMs: 100 });
  });

  afterEach(() => {
    manager.cleanupAll();
    vi.clearAllMocks();
  });

  describe('setupSSEResponse', () => {
    it('should set correct SSE headers', () => {
      const reply = createMockReply();

      setupSSEResponse(reply);

      expect(reply.raw.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream'
      );
      expect(reply.raw.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-cache'
      );
      expect(reply.raw.setHeader).toHaveBeenCalledWith(
        'Connection',
        'keep-alive'
      );
      expect(reply.raw.setHeader).toHaveBeenCalledWith(
        'X-Accel-Buffering',
        'no'
      );
    });
  });

  describe('formatSSEMessage', () => {
    it('should format heartbeat event correctly', () => {
      const event: SSEEvent = {
        type: 'heartbeat',
        timestamp: '2026-01-10T12:00:00Z',
      };

      const message = formatSSEMessage(event);

      expect(message).toBe(
        'event: heartbeat\ndata: {"type":"heartbeat","timestamp":"2026-01-10T12:00:00Z"}\n\n'
      );
    });

    it('should format generation_started event correctly', () => {
      const event: SSEEvent = {
        type: 'generation_started',
        contentType: 'narration',
      };

      const message = formatSSEMessage(event);

      expect(message).toBe(
        'event: generation_started\ndata: {"type":"generation_started","contentType":"narration"}\n\n'
      );
    });

    it('should format generation_complete event correctly', () => {
      const event: SSEEvent = {
        type: 'generation_complete',
        content: {
          id: 'test-123',
          generationType: 'narration',
          eventType: 'party_action',
          content: 'Marcus draws his sword.',
        },
      };

      const message = formatSSEMessage(event);

      expect(message).toContain('event: generation_complete\n');
      expect(message).toContain('Marcus draws his sword.');
      expect(message.endsWith('\n\n')).toBe(true);
    });
  });

  describe('subscribe', () => {
    it('should return a client ID', () => {
      const reply = createMockReply();

      const clientId = manager.subscribe('game-123', reply);

      expect(clientId).toBeDefined();
      expect(typeof clientId).toBe('string');
      expect(clientId.length).toBeGreaterThan(0);
    });

    it('should set up SSE headers on the response', () => {
      const reply = createMockReply();

      manager.subscribe('game-123', reply);

      expect(reply.raw.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream'
      );
    });

    it('should track client count correctly', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();

      expect(manager.getClientCount('game-123')).toBe(0);

      manager.subscribe('game-123', reply1);
      expect(manager.getClientCount('game-123')).toBe(1);

      manager.subscribe('game-123', reply2);
      expect(manager.getClientCount('game-123')).toBe(2);
    });

    it('should support options object overload', () => {
      const reply = createMockReply();

      const clientId = manager.subscribe({
        gameId: 'game-123',
        response: reply,
      });

      expect(clientId).toBeDefined();
      expect(manager.getClientCount('game-123')).toBe(1);
    });
  });

  describe('unsubscribe', () => {
    it('should remove client from tracking', () => {
      const reply = createMockReply();
      const clientId = manager.subscribe('game-123', reply);

      expect(manager.getClientCount('game-123')).toBe(1);

      manager.unsubscribe('game-123', clientId);

      expect(manager.getClientCount('game-123')).toBe(0);
    });

    it('should handle unsubscribing non-existent client gracefully', () => {
      // Should not throw
      expect(() =>
        manager.unsubscribe('game-123', 'non-existent-id')
      ).not.toThrow();
    });

    it('should clean up automatically on connection close', () => {
      const reply = createMockReply() as ReturnType<typeof createMockReply> & {
        _simulateClose: () => void;
      };
      manager.subscribe('game-123', reply);

      expect(manager.getClientCount('game-123')).toBe(1);

      reply._simulateClose();

      expect(manager.getClientCount('game-123')).toBe(0);
    });
  });

  describe('broadcast', () => {
    it('should send event to all clients for a game', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();
      manager.subscribe('game-123', reply1);
      manager.subscribe('game-123', reply2);

      const event: SSEEvent = {
        type: 'heartbeat',
        timestamp: '2026-01-10T12:00:00Z',
      };

      manager.broadcast('game-123', event);

      expect(reply1.raw.write).toHaveBeenCalledTimes(1);
      expect(reply2.raw.write).toHaveBeenCalledTimes(1);
      expect(reply1.raw.write).toHaveBeenCalledWith(formatSSEMessage(event));
    });

    it('should not send to clients in different games', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();
      manager.subscribe('game-123', reply1);
      manager.subscribe('game-456', reply2);

      const event: SSEEvent = {
        type: 'heartbeat',
        timestamp: '2026-01-10T12:00:00Z',
      };

      manager.broadcast('game-123', event);

      expect(reply1.raw.write).toHaveBeenCalledTimes(1);
      expect(reply2.raw.write).not.toHaveBeenCalled();
    });

    it('should handle broadcast to non-existent game gracefully', () => {
      const event: SSEEvent = {
        type: 'heartbeat',
        timestamp: '2026-01-10T12:00:00Z',
      };

      // Should not throw
      expect(() => manager.broadcast('non-existent', event)).not.toThrow();
    });
  });

  describe('send', () => {
    it('should send event to specific client', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();
      const clientId1 = manager.subscribe('game-123', reply1);
      manager.subscribe('game-123', reply2);

      const event: SSEEvent = {
        type: 'generation_started',
        contentType: 'narration',
      };

      manager.send(clientId1, event);

      expect(reply1.raw.write).toHaveBeenCalledTimes(1);
      expect(reply2.raw.write).not.toHaveBeenCalled();
    });

    it('should handle sending to non-existent client gracefully', () => {
      const event: SSEEvent = {
        type: 'heartbeat',
        timestamp: '2026-01-10T12:00:00Z',
      };

      // Should not throw
      expect(() => manager.send('non-existent', event)).not.toThrow();
    });
  });

  describe('heartbeat', () => {
    it('should send heartbeats at the specified interval', async () => {
      const reply = createMockReply();
      manager.subscribe('game-123', reply);

      manager.startHeartbeat(50);

      // Wait for at least one heartbeat
      await new Promise((resolve) => setTimeout(resolve, 70));

      manager.stopHeartbeat();

      // Should have received at least one heartbeat
      expect(reply.raw.write).toHaveBeenCalled();
      const lastCall = reply.raw.write.mock.calls[0][0];
      expect(lastCall).toContain('event: heartbeat');
    });

    it('should stop heartbeats when stopHeartbeat is called', async () => {
      const reply = createMockReply();
      manager.subscribe('game-123', reply);

      manager.startHeartbeat(50);
      manager.stopHeartbeat();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 70));

      // Should not have received any heartbeats
      expect(reply.raw.write).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should remove all clients for a game', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();
      manager.subscribe('game-123', reply1);
      manager.subscribe('game-123', reply2);

      expect(manager.getClientCount('game-123')).toBe(2);

      manager.cleanup('game-123');

      expect(manager.getClientCount('game-123')).toBe(0);
    });

    it('should end client responses', () => {
      const reply = createMockReply();
      manager.subscribe('game-123', reply);

      manager.cleanup('game-123');

      expect(reply.raw.end).toHaveBeenCalled();
    });
  });

  describe('cleanupAll', () => {
    it('should remove all clients from all games', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();
      manager.subscribe('game-123', reply1);
      manager.subscribe('game-456', reply2);

      expect(manager.getClientCount('game-123')).toBe(1);
      expect(manager.getClientCount('game-456')).toBe(1);

      manager.cleanupAll();

      expect(manager.getClientCount('game-123')).toBe(0);
      expect(manager.getClientCount('game-456')).toBe(0);
    });

    it('should stop heartbeat timer', () => {
      manager.startHeartbeat(50);
      manager.cleanupAll();

      // Heartbeat should be stopped - no errors expected
      expect(() => manager.startHeartbeat(50)).not.toThrow();
      manager.stopHeartbeat();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();
      const reply3 = createMockReply();
      manager.subscribe('game-123', reply1);
      manager.subscribe('game-123', reply2);
      manager.subscribe('game-456', reply3);

      const stats = manager.getStats();

      expect(stats.totalClients).toBe(3);
      expect(stats.activeGames).toBe(2);
      expect(stats.clientsByGame.get('game-123')).toBe(2);
      expect(stats.clientsByGame.get('game-456')).toBe(1);
    });

    it('should return empty stats when no clients', () => {
      const stats = manager.getStats();

      expect(stats.totalClients).toBe(0);
      expect(stats.activeGames).toBe(0);
      expect(stats.clientsByGame.size).toBe(0);
    });
  });

  describe('dead connection handling', () => {
    it('should clean up clients with non-writable responses on broadcast', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();
      manager.subscribe('game-123', reply1);
      manager.subscribe('game-123', reply2);

      // Simulate one connection becoming non-writable
      reply1.raw.writable = false;

      const event: SSEEvent = {
        type: 'heartbeat',
        timestamp: '2026-01-10T12:00:00Z',
      };

      manager.broadcast('game-123', event);

      // After broadcast, dead client should be cleaned up
      expect(manager.getClientCount('game-123')).toBe(1);
    });

    it('should clean up clients that throw errors on write', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();
      manager.subscribe('game-123', reply1);
      manager.subscribe('game-123', reply2);

      // Simulate write error
      reply1.raw.write.mockImplementation(() => {
        throw new Error('Connection reset');
      });

      const event: SSEEvent = {
        type: 'heartbeat',
        timestamp: '2026-01-10T12:00:00Z',
      };

      manager.broadcast('game-123', event);

      // After broadcast, erroring client should be cleaned up
      expect(manager.getClientCount('game-123')).toBe(1);
    });
  });
});
