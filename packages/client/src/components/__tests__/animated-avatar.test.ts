import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnimatedAvatar } from '../animated-avatar.js';
import type { PixelArt, PixelArtAnimation } from '@reckoning/shared';

// =============================================================================
// Mock PixelsrcRenderer
// =============================================================================

const mockPngData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const createMockRenderer = () => ({
  render: vi.fn().mockReturnValue({
    data: mockPngData,
    spriteName: 'test-sprite',
    fromCache: false,
  }),
  listSprites: vi.fn().mockReturnValue(['test-sprite']),
  init: vi.fn().mockResolvedValue(undefined),
  isInitialized: vi.fn().mockReturnValue(true),
  clearCache: vi.fn(),
  getCacheStats: vi.fn().mockReturnValue({ size: 0, maxSize: 100 }),
});

// =============================================================================
// Mock ImageBitmap
// =============================================================================

const mockImageBitmap = {
  width: 64,
  height: 64,
  close: vi.fn(),
};

// =============================================================================
// Mock createImageBitmap
// =============================================================================

vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(mockImageBitmap));

// =============================================================================
// Mock Canvas 2D Context
// =============================================================================

const createMockContext = () => ({
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  imageSmoothingEnabled: true,
  globalAlpha: 1,
  fillStyle: '',
  font: '',
  textAlign: 'left',
  textBaseline: 'alphabetic',
});

// Store the original getContext
const originalGetContext = HTMLCanvasElement.prototype.getContext;

// Override getContext to return our mock
beforeEach(() => {
  const mockCtx = createMockContext();
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockCtx);
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

// =============================================================================
// Mock Data
// =============================================================================

function createMockPixelArt(overrides: Partial<PixelArt> = {}): PixelArt {
  return {
    source: '{"type":"sprite","name":"test","palette":{},"grid":[]}',
    ...overrides,
  };
}

function createMockAnimation(): PixelArtAnimation {
  return {
    states: {
      idle: {
        keyframes: {
          '0': { transform: 'translateY(0)' },
          '50': { transform: 'translateY(-2px)' },
          '100': { transform: 'translateY(0)' },
        },
        duration: 2000,
        loop: true,
      },
      talking: {
        keyframes: {
          '0': { transform: 'translateY(0) scale(1)' },
          '50': { transform: 'translateY(-1px) scale(1.05)' },
          '100': { transform: 'translateY(0) scale(1)' },
        },
        duration: 300,
        loop: true,
      },
    },
    defaultState: 'idle',
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('AnimatedAvatar', () => {
  let mockRenderer: ReturnType<typeof createMockRenderer>;
  let rafCallbacks: ((timestamp: number) => void)[];
  let originalRAF: typeof requestAnimationFrame;
  let originalCAF: typeof cancelAnimationFrame;

  beforeEach(() => {
    mockRenderer = createMockRenderer();

    // Track requestAnimationFrame callbacks
    rafCallbacks = [];
    originalRAF = globalThis.requestAnimationFrame;
    originalCAF = globalThis.cancelAnimationFrame;

    let rafId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void) => {
      rafCallbacks.push(callback);
      return ++rafId;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    // Reset ImageBitmap mock
    mockImageBitmap.close.mockClear();
    (globalThis.createImageBitmap as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    // Remove injected styles
    const styles = document.getElementById('animated-avatar-styles');
    if (styles) {
      styles.remove();
    }

    // Restore globals
    vi.stubGlobal('requestAnimationFrame', originalRAF);
    vi.stubGlobal('cancelAnimationFrame', originalCAF);

    vi.clearAllMocks();
  });

  // Helper to trigger async initialization
  async function waitForInit(): Promise<void> {
    // Allow async operations to complete
    await vi.waitFor(() => {
      expect(globalThis.createImageBitmap).toHaveBeenCalled();
    });
    // Flush promises
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  describe('constructor', () => {
    it('should create a canvas element', () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never
      );
      const element = avatar.getElement();

      expect(element).toBeInstanceOf(HTMLCanvasElement);
      expect(element.className).toBe('animated-avatar');
    });

    it('should use default size of 64x64', () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never
      );
      const element = avatar.getElement();

      expect(element.width).toBe(64);
      expect(element.height).toBe(64);
    });

    it('should allow custom size', () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never,
        undefined,
        { size: 128 }
      );
      const element = avatar.getElement();

      expect(element.width).toBe(128);
      expect(element.height).toBe(128);
    });

    it('should apply display scale via CSS', () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never,
        undefined,
        { size: 64, displayScale: 2 }
      );
      const element = avatar.getElement();

      expect(element.style.width).toBe('128px');
      expect(element.style.height).toBe('128px');
    });

    it('should set pixel-perfect rendering style', () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never
      );
      const element = avatar.getElement();

      expect(element.style.imageRendering).toBe('pixelated');
    });

    it('should auto-play by default', async () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never
      );

      await waitForInit();

      expect(avatar.isAnimating()).toBe(true);
    });

    it('should not auto-play when autoPlay is false', async () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never,
        undefined,
        { autoPlay: false }
      );

      await waitForInit();

      expect(avatar.isAnimating()).toBe(false);
    });

    it('should render initial sprite', async () => {
      new AnimatedAvatar(createMockPixelArt(), mockRenderer as never);

      await waitForInit();

      expect(mockRenderer.render).toHaveBeenCalled();
    });

    it('should pass sprite name to renderer when provided', async () => {
      new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never,
        'custom-sprite'
      );

      await waitForInit();

      expect(mockRenderer.render).toHaveBeenCalledWith(
        expect.any(String),
        'custom-sprite'
      );
    });
  });

  describe('play', () => {
    it('should start animation', async () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never,
        undefined,
        { autoPlay: false }
      );

      await waitForInit();

      avatar.play();

      expect(avatar.isAnimating()).toBe(true);
    });

    it('should default to idle state', async () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never,
        undefined,
        { autoPlay: false }
      );

      await waitForInit();

      avatar.play();

      expect(avatar.getCurrentState()).toBe('idle');
    });

    it('should accept state parameter', async () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never,
        undefined,
        { autoPlay: false }
      );

      await waitForInit();

      avatar.play('talking');

      expect(avatar.getCurrentState()).toBe('talking');
    });

    it('should request animation frame', async () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never,
        undefined,
        { autoPlay: false }
      );

      await waitForInit();

      const initialCallCount = rafCallbacks.length;
      avatar.play();

      expect(rafCallbacks.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe('stop', () => {
    it('should stop animation', async () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never
      );

      await waitForInit();

      avatar.stop();

      expect(avatar.isAnimating()).toBe(false);
    });

    it('should return to idle state', async () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never
      );

      await waitForInit();

      avatar.play('talking');
      avatar.stop();

      expect(avatar.getCurrentState()).toBe('idle');
    });

    it('should cancel animation frame', async () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never
      );

      await waitForInit();

      avatar.stop();

      expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe('startSpeaking', () => {
    it('should switch to talking state', async () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never
      );

      await waitForInit();

      avatar.startSpeaking();

      expect(avatar.getCurrentState()).toBe('talking');
    });

    it('should be playing', async () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never,
        undefined,
        { autoPlay: false }
      );

      await waitForInit();

      avatar.startSpeaking();

      expect(avatar.isAnimating()).toBe(true);
    });
  });

  describe('stopSpeaking', () => {
    it('should return to idle after delay', async () => {
      vi.useFakeTimers();

      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never,
        undefined,
        { speakingEndDelay: 100 }
      );

      // Manually resolve the async init
      await vi.runAllTimersAsync();

      avatar.startSpeaking();
      expect(avatar.getCurrentState()).toBe('talking');

      avatar.stopSpeaking();

      // Still talking before delay
      expect(avatar.getCurrentState()).toBe('talking');

      // After delay, should be idle
      await vi.advanceTimersByTimeAsync(150);
      expect(avatar.getCurrentState()).toBe('idle');

      vi.useRealTimers();
    });

    it('should cancel pending stop when startSpeaking is called again', async () => {
      vi.useFakeTimers();

      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never,
        undefined,
        { speakingEndDelay: 100 }
      );

      await vi.runAllTimersAsync();

      avatar.startSpeaking();
      avatar.stopSpeaking();

      // Start speaking again before delay expires
      await vi.advanceTimersByTimeAsync(50);
      avatar.startSpeaking();

      // After original delay would have expired, still talking
      await vi.advanceTimersByTimeAsync(100);
      expect(avatar.getCurrentState()).toBe('talking');

      vi.useRealTimers();
    });
  });

  describe('getElement', () => {
    it('should return the canvas element', () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never
      );

      const element = avatar.getElement();

      expect(element).toBeInstanceOf(HTMLCanvasElement);
    });

    it('should return the same element on multiple calls', () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never
      );

      const element1 = avatar.getElement();
      const element2 = avatar.getElement();

      expect(element1).toBe(element2);
    });
  });

  describe('destroy', () => {
    it('should stop animation', async () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never
      );

      await waitForInit();

      avatar.destroy();

      expect(avatar.isAnimating()).toBe(false);
    });

    it('should close cached ImageBitmaps', async () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never
      );

      await waitForInit();

      avatar.destroy();

      expect(mockImageBitmap.close).toHaveBeenCalled();
    });

    it('should remove canvas from DOM if attached', async () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never
      );

      await waitForInit();

      const element = avatar.getElement();
      document.body.appendChild(element);

      expect(document.body.contains(element)).toBe(true);

      avatar.destroy();

      expect(document.body.contains(element)).toBe(false);
    });

    it('should handle destroy when canvas is not in DOM', async () => {
      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never
      );

      await waitForInit();

      // Should not throw
      expect(() => avatar.destroy()).not.toThrow();
    });
  });

  describe('animation with metadata', () => {
    it('should use animation metadata when provided', async () => {
      const pixelArt = createMockPixelArt({
        animation: createMockAnimation(),
      });

      const avatar = new AnimatedAvatar(
        pixelArt,
        mockRenderer as never
      );

      await waitForInit();

      // Animation should use the provided metadata
      expect(avatar.getCurrentState()).toBe('idle');
    });

    it('should use default animations when no metadata', async () => {
      const pixelArt = createMockPixelArt();

      const avatar = new AnimatedAvatar(
        pixelArt,
        mockRenderer as never
      );

      await waitForInit();

      // Should still work with default animations
      avatar.play('talking');
      expect(avatar.getCurrentState()).toBe('talking');
    });
  });

  describe('style injection', () => {
    it('should inject styles once', () => {
      new AnimatedAvatar(createMockPixelArt(), mockRenderer as never);
      new AnimatedAvatar(createMockPixelArt(), mockRenderer as never);

      const styles = document.querySelectorAll('#animated-avatar-styles');
      expect(styles.length).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should handle render failure gracefully', async () => {
      mockRenderer.render.mockImplementation(() => {
        throw new Error('Render failed');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const avatar = new AnimatedAvatar(
        createMockPixelArt(),
        mockRenderer as never
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not throw, avatar should still exist
      expect(avatar.getElement()).toBeInstanceOf(HTMLCanvasElement);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
