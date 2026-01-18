import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PixelsrcRenderer,
  PixelsrcRenderError,
} from '../index.js';

// Mock the WASM module
vi.mock('@stiwi/pixelsrc-wasm', () => ({
  default: vi.fn().mockResolvedValue(undefined),
  render_to_png: vi.fn(),
  list_sprites: vi.fn(),
  init_panic_hook: vi.fn(),
}));

describe('PixelsrcRenderer', () => {
  let renderer: PixelsrcRenderer;
  let mockWasm: {
    default: ReturnType<typeof vi.fn>;
    render_to_png: ReturnType<typeof vi.fn>;
    list_sprites: ReturnType<typeof vi.fn>;
    init_panic_hook: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mocked module
    mockWasm = await import('@stiwi/pixelsrc-wasm') as unknown as typeof mockWasm;

    renderer = new PixelsrcRenderer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('should initialize the WASM module', async () => {
      await renderer.init();

      expect(mockWasm.default).toHaveBeenCalled();
      expect(mockWasm.init_panic_hook).toHaveBeenCalled();
      expect(renderer.isInitialized()).toBe(true);
    });

    it('should only initialize once', async () => {
      await renderer.init();
      await renderer.init();

      expect(mockWasm.default).toHaveBeenCalledTimes(1);
    });

    it('should pass wasmPath when provided', async () => {
      await renderer.init('/path/to/wasm');

      expect(mockWasm.default).toHaveBeenCalledWith('/path/to/wasm');
    });
  });

  describe('listSprites', () => {
    it('should throw if not initialized', () => {
      expect(() => renderer.listSprites('source')).toThrow(PixelsrcRenderError);
      expect(() => renderer.listSprites('source')).toThrow(
        'PixelsrcRenderer not initialized'
      );
    });

    it('should return empty array for empty source', async () => {
      await renderer.init();

      expect(renderer.listSprites('')).toEqual([]);
      expect(renderer.listSprites('   ')).toEqual([]);
    });

    it('should return sprite names from source', async () => {
      await renderer.init();
      mockWasm.list_sprites.mockReturnValue(['hero', 'enemy', 'coin']);

      const source = `{"type":"sprite","name":"hero","palette":{},"grid":[]}
{"type":"sprite","name":"enemy","palette":{},"grid":[]}
{"type":"sprite","name":"coin","palette":{},"grid":[]}`;

      const result = renderer.listSprites(source);

      expect(result).toEqual(['hero', 'enemy', 'coin']);
      expect(mockWasm.list_sprites).toHaveBeenCalledWith(source);
    });

    it('should wrap WASM errors', async () => {
      await renderer.init();
      mockWasm.list_sprites.mockImplementation(() => {
        throw new Error('WASM error');
      });

      expect(() => renderer.listSprites('source')).toThrow(PixelsrcRenderError);
      expect(() => renderer.listSprites('source')).toThrow('Failed to list sprites');
    });
  });

  describe('render', () => {
    const minimalSprite =
      '{"type":"sprite","name":"dot","palette":{"{x}":"#FF0000"},"grid":["{x}"]}';

    // PNG magic bytes
    const mockPngData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    beforeEach(() => {
      mockWasm.list_sprites.mockReturnValue(['dot']);
    });

    it('should throw if not initialized', () => {
      expect(() => renderer.render(minimalSprite)).toThrow(PixelsrcRenderError);
      expect(() => renderer.render(minimalSprite)).toThrow(
        'PixelsrcRenderer not initialized'
      );
    });

    it('should throw for empty source', async () => {
      await renderer.init();

      expect(() => renderer.render('')).toThrow(PixelsrcRenderError);
      expect(() => renderer.render('')).toThrow('Source cannot be empty');
    });

    it('should render first sprite by default', async () => {
      await renderer.init();
      mockWasm.render_to_png.mockReturnValue(mockPngData);

      const result = renderer.render(minimalSprite);

      expect(result.data).toEqual(mockPngData);
      expect(result.spriteName).toBe('dot');
      expect(result.fromCache).toBe(false);
      expect(mockWasm.render_to_png).toHaveBeenCalledWith(minimalSprite);
    });

    it('should filter source for named sprite', async () => {
      await renderer.init();
      mockWasm.render_to_png.mockReturnValue(mockPngData);
      mockWasm.list_sprites.mockReturnValue(['hero', 'enemy']);

      const multiSprite = `{"type":"palette","name":"colors","colors":{"{x}":"#FF0000"}}
{"type":"sprite","name":"hero","palette":{},"grid":["{x}"]}
{"type":"sprite","name":"enemy","palette":{},"grid":["{x}"]}`;

      renderer.render(multiSprite, 'enemy');

      // Should have filtered to only include palette and the requested sprite
      const callArg = mockWasm.render_to_png.mock.calls[0]![0] as string;
      expect(callArg).toContain('"type":"palette"');
      expect(callArg).toContain('"name":"enemy"');
      expect(callArg).not.toContain('"name":"hero"');
    });

    it('should throw if named sprite not found', async () => {
      await renderer.init();
      mockWasm.list_sprites.mockReturnValue(['hero']);

      const source =
        '{"type":"sprite","name":"hero","palette":{},"grid":[]}';

      expect(() => renderer.render(source, 'nonexistent')).toThrow(
        PixelsrcRenderError
      );
      expect(() => renderer.render(source, 'nonexistent')).toThrow(
        'Sprite "nonexistent" not found'
      );
    });

    it('should throw if render returns empty', async () => {
      await renderer.init();
      mockWasm.render_to_png.mockReturnValue(new Uint8Array(0));

      expect(() => renderer.render(minimalSprite)).toThrow(PixelsrcRenderError);
      expect(() => renderer.render(minimalSprite)).toThrow('No sprite rendered');
    });

    it('should warn when scale option is used', async () => {
      await renderer.init();
      mockWasm.render_to_png.mockReturnValue(mockPngData);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      renderer.render(minimalSprite, undefined, { scale: 4 });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('scale option')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('not yet supported')
      );

      warnSpy.mockRestore();
    });

    it('should not warn when scale is 1', async () => {
      await renderer.init();
      mockWasm.render_to_png.mockReturnValue(mockPngData);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      renderer.render(minimalSprite, undefined, { scale: 1 });

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should wrap WASM errors', async () => {
      await renderer.init();
      mockWasm.render_to_png.mockImplementation(() => {
        throw new Error('WASM render error');
      });

      expect(() => renderer.render(minimalSprite)).toThrow(PixelsrcRenderError);
      expect(() => renderer.render(minimalSprite)).toThrow('Failed to render');
    });
  });

  describe('caching', () => {
    const minimalSprite =
      '{"type":"sprite","name":"dot","palette":{"{x}":"#FF0000"},"grid":["{x}"]}';
    const mockPngData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    beforeEach(() => {
      mockWasm.list_sprites.mockReturnValue(['dot']);
      mockWasm.render_to_png.mockReturnValue(mockPngData);
    });

    it('should cache render results', async () => {
      await renderer.init();

      // First render
      const result1 = renderer.render(minimalSprite);
      expect(result1.fromCache).toBe(false);
      expect(mockWasm.render_to_png).toHaveBeenCalledTimes(1);

      // Second render with same source should be cached
      const result2 = renderer.render(minimalSprite);
      expect(result2.fromCache).toBe(true);
      expect(result2.data).toEqual(mockPngData);
      expect(mockWasm.render_to_png).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should bypass cache when requested', async () => {
      await renderer.init();

      // First render
      renderer.render(minimalSprite);
      expect(mockWasm.render_to_png).toHaveBeenCalledTimes(1);

      // Second render with bypass
      const result = renderer.render(minimalSprite, undefined, { bypassCache: true });
      expect(result.fromCache).toBe(false);
      expect(mockWasm.render_to_png).toHaveBeenCalledTimes(2);
    });

    it('should have separate cache entries for different sprites', async () => {
      await renderer.init();

      const sprite1 = '{"type":"sprite","name":"a","palette":{},"grid":[]}';
      const sprite2 = '{"type":"sprite","name":"b","palette":{},"grid":[]}';

      mockWasm.list_sprites.mockReturnValueOnce(['a']).mockReturnValueOnce(['b']);

      renderer.render(sprite1);
      renderer.render(sprite2);

      // Both should trigger renders
      expect(mockWasm.render_to_png).toHaveBeenCalledTimes(2);

      // Both should be cached now
      const stats = renderer.getCacheStats();
      expect(stats.size).toBe(2);
    });

    it('should evict oldest entries when cache is full', async () => {
      const smallCacheRenderer = new PixelsrcRenderer({ maxCacheSize: 2 });
      await smallCacheRenderer.init();

      mockWasm.list_sprites.mockReturnValue(['s']);

      // Fill cache with 3 entries (cache size is 2)
      smallCacheRenderer.render('{"type":"sprite","name":"s","id":"1","palette":{},"grid":[]}');
      smallCacheRenderer.render('{"type":"sprite","name":"s","id":"2","palette":{},"grid":[]}');
      smallCacheRenderer.render('{"type":"sprite","name":"s","id":"3","palette":{},"grid":[]}');

      const stats = smallCacheRenderer.getCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(2);
    });

    it('should clear cache', async () => {
      await renderer.init();

      renderer.render(minimalSprite);
      expect(renderer.getCacheStats().size).toBe(1);

      renderer.clearCache();
      expect(renderer.getCacheStats().size).toBe(0);

      // Should re-render after cache clear
      const result = renderer.render(minimalSprite);
      expect(result.fromCache).toBe(false);
    });

    it('should expire old cache entries', async () => {
      // Create renderer with very short TTL
      const shortTTLRenderer = new PixelsrcRenderer({ cacheTTL: 10 });
      await shortTTLRenderer.init();

      mockWasm.list_sprites.mockReturnValue(['dot']);

      // First render
      shortTTLRenderer.render(minimalSprite);
      expect(mockWasm.render_to_png).toHaveBeenCalledTimes(1);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Should re-render because cache expired
      const result = shortTTLRenderer.render(minimalSprite);
      expect(result.fromCache).toBe(false);
      expect(mockWasm.render_to_png).toHaveBeenCalledTimes(2);
    });
  });

  describe('isInitialized', () => {
    it('should return false before init', () => {
      expect(renderer.isInitialized()).toBe(false);
    });

    it('should return true after init', async () => {
      await renderer.init();
      expect(renderer.isInitialized()).toBe(true);
    });
  });

  describe('PixelsrcRenderError', () => {
    it('should have correct name and message', () => {
      const error = new PixelsrcRenderError('Test error', 'source', 'sprite');

      expect(error.name).toBe('PixelsrcRenderError');
      expect(error.message).toBe('Test error');
      expect(error.source).toBe('source');
      expect(error.spriteName).toBe('sprite');
    });

    it('should work without optional params', () => {
      const error = new PixelsrcRenderError('Test error');

      expect(error.name).toBe('PixelsrcRenderError');
      expect(error.message).toBe('Test error');
      expect(error.source).toBeUndefined();
      expect(error.spriteName).toBeUndefined();
    });
  });
});
