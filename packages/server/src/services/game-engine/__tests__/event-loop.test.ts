import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventLoop } from '../event-loop.js';

describe('EventLoop', () => {
  let eventLoop: EventLoop;
  let generateCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    eventLoop = new EventLoop();
    generateCallback = vi.fn().mockResolvedValue(undefined);
    eventLoop.setGenerateCallback(generateCallback);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('playback modes', () => {
    it('should default to paused mode', () => {
      expect(eventLoop.getMode('game-123')).toBe('paused');
    });

    it('should set and get playback mode', () => {
      eventLoop.setMode('game-123', 'auto');
      expect(eventLoop.getMode('game-123')).toBe('auto');

      eventLoop.setMode('game-123', 'stepping');
      expect(eventLoop.getMode('game-123')).toBe('stepping');
    });

    it('should track modes per game', () => {
      eventLoop.setMode('game-1', 'auto');
      eventLoop.setMode('game-2', 'paused');

      expect(eventLoop.getMode('game-1')).toBe('auto');
      expect(eventLoop.getMode('game-2')).toBe('paused');
    });

    it('should abort pending generation when stopped', async () => {
      eventLoop.setMode('game-123', 'auto');

      // Start a generation
      const stepPromise = eventLoop.step('game-123');

      // Stop should set aborted flag
      eventLoop.setMode('game-123', 'stopped');

      await stepPromise;

      // Subsequent step should not generate
      await eventLoop.step('game-123');
      expect(generateCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('onSubmit', () => {
    it('should auto-advance in auto mode', async () => {
      eventLoop.setMode('game-123', 'auto');

      await eventLoop.onSubmit('game-123');

      expect(generateCallback).toHaveBeenCalledWith('game-123');
    });

    it('should not auto-advance in paused mode', async () => {
      eventLoop.setMode('game-123', 'paused');

      await eventLoop.onSubmit('game-123');

      expect(generateCallback).not.toHaveBeenCalled();
    });

    it('should not auto-advance in stepping mode', async () => {
      eventLoop.setMode('game-123', 'stepping');

      await eventLoop.onSubmit('game-123');

      expect(generateCallback).not.toHaveBeenCalled();
    });

    it('should not auto-advance in stopped mode', async () => {
      eventLoop.setMode('game-123', 'stopped');

      await eventLoop.onSubmit('game-123');

      expect(generateCallback).not.toHaveBeenCalled();
    });
  });

  describe('step', () => {
    it('should trigger generation', async () => {
      eventLoop.setMode('game-123', 'stepping');

      await eventLoop.step('game-123');

      expect(generateCallback).toHaveBeenCalledWith('game-123');
    });

    it('should not trigger generation when stopped', async () => {
      eventLoop.setMode('game-123', 'stopped');

      await eventLoop.step('game-123');

      expect(generateCallback).not.toHaveBeenCalled();
    });

    it('should not double-generate if already generating', async () => {
      eventLoop.setMode('game-123', 'auto');

      // Mock a slow generation
      let resolveGeneration: () => void;
      generateCallback.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveGeneration = resolve;
          })
      );

      // Start first generation
      const step1Promise = eventLoop.step('game-123');

      // Try to step again while generating
      const step2Promise = eventLoop.step('game-123');

      // Resolve the generation
      resolveGeneration!();

      await Promise.all([step1Promise, step2Promise]);

      // Should only have generated once
      expect(generateCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('should set mode to stopped', () => {
      eventLoop.setMode('game-123', 'auto');
      eventLoop.stop('game-123');

      expect(eventLoop.getMode('game-123')).toBe('stopped');
    });
  });

  describe('isGenerating', () => {
    it('should return false when not generating', () => {
      expect(eventLoop.isGenerating('game-123')).toBe(false);
    });

    it('should return true when generating', async () => {
      let resolveGeneration: () => void;
      generateCallback.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveGeneration = resolve;
          })
      );

      const stepPromise = eventLoop.step('game-123');

      expect(eventLoop.isGenerating('game-123')).toBe(true);

      resolveGeneration!();
      await stepPromise;

      expect(eventLoop.isGenerating('game-123')).toBe(false);
    });
  });

  describe('waitForPending', () => {
    it('should resolve immediately when not generating', async () => {
      await eventLoop.waitForPending('game-123');
      // Should complete without hanging
    });

    it('should wait for pending generation', async () => {
      let resolveGeneration: () => void;
      generateCallback.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveGeneration = resolve;
          })
      );

      const stepPromise = eventLoop.step('game-123');

      // Start waiting
      let waitResolved = false;
      const waitPromise = eventLoop.waitForPending('game-123').then(() => {
        waitResolved = true;
      });

      // Should not have resolved yet
      await new Promise((r) => setTimeout(r, 10));
      expect(waitResolved).toBe(false);

      // Resolve generation
      resolveGeneration!();
      await Promise.all([stepPromise, waitPromise]);

      expect(waitResolved).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should clean up game state', () => {
      eventLoop.setMode('game-123', 'auto');

      eventLoop.cleanup('game-123');

      // Mode should be reset to default
      expect(eventLoop.getMode('game-123')).toBe('paused');
    });
  });

  describe('without callback', () => {
    it('should handle operations gracefully without callback', async () => {
      const loopWithoutCallback = new EventLoop();

      await loopWithoutCallback.step('game-123');
      await loopWithoutCallback.onSubmit('game-123');

      // Should not throw
    });
  });
});
