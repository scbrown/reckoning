import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PixelsrcRenderer,
  PixelsrcRenderError,
} from '../pixelsrc/renderer.js';

// Mock the WASM module
vi.mock('@stiwi/pixelsrc-wasm', () => ({
  default: vi.fn().mockResolvedValue(undefined),
  render_to_png: vi.fn(),
  list_sprites: vi.fn(),
  validate: vi.fn(),
  init_panic_hook: vi.fn(),
}));

// Mock fs for WASM file loading
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue(Buffer.from('mock-wasm-bytes')),
}));

describe('PixelsrcRenderer', () => {
  let renderer: PixelsrcRenderer;
  let mockWasm: {
    default: ReturnType<typeof vi.fn>;
    render_to_png: ReturnType<typeof vi.fn>;
    list_sprites: ReturnType<typeof vi.fn>;
    validate: ReturnType<typeof vi.fn>;
    init_panic_hook: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mocked module
    mockWasm = await import('@stiwi/pixelsrc-wasm') as typeof mockWasm;

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

  describe('renderToPng', () => {
    const minimalSprite =
      '{"type":"sprite","name":"dot","palette":{"{x}":"#FF0000"},"grid":["{x}"]}';

    // PNG magic bytes
    const mockPngData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    it('should throw if not initialized', () => {
      expect(() => renderer.renderToPng(minimalSprite)).toThrow(PixelsrcRenderError);
      expect(() => renderer.renderToPng(minimalSprite)).toThrow(
        'PixelsrcRenderer not initialized'
      );
    });

    it('should throw for empty source', async () => {
      await renderer.init();

      expect(() => renderer.renderToPng('')).toThrow(PixelsrcRenderError);
      expect(() => renderer.renderToPng('')).toThrow('Source cannot be empty');
    });

    it('should render first sprite by default', async () => {
      await renderer.init();
      mockWasm.render_to_png.mockReturnValue(mockPngData);

      const result = renderer.renderToPng(minimalSprite);

      expect(result).toEqual(mockPngData);
      expect(mockWasm.render_to_png).toHaveBeenCalledWith(minimalSprite);
    });

    it('should filter source for named sprite', async () => {
      await renderer.init();
      mockWasm.render_to_png.mockReturnValue(mockPngData);

      const multiSprite = `{"type":"palette","name":"colors","colors":{"{x}":"#FF0000"}}
{"type":"sprite","name":"hero","palette":{},"grid":["{x}"]}
{"type":"sprite","name":"enemy","palette":{},"grid":["{x}"]}`;

      renderer.renderToPng(multiSprite, 'enemy');

      // Should have filtered to only include palette and the requested sprite
      const callArg = mockWasm.render_to_png.mock.calls[0][0];
      expect(callArg).toContain('"type":"palette"');
      expect(callArg).toContain('"name":"enemy"');
      expect(callArg).not.toContain('"name":"hero"');
    });

    it('should throw if named sprite not found', async () => {
      await renderer.init();

      const source =
        '{"type":"sprite","name":"hero","palette":{},"grid":[]}';

      expect(() => renderer.renderToPng(source, 'nonexistent')).toThrow(
        PixelsrcRenderError
      );
      expect(() => renderer.renderToPng(source, 'nonexistent')).toThrow(
        'Sprite "nonexistent" not found'
      );
    });

    it('should throw if render returns empty', async () => {
      await renderer.init();
      mockWasm.render_to_png.mockReturnValue(new Uint8Array(0));

      expect(() => renderer.renderToPng(minimalSprite)).toThrow(PixelsrcRenderError);
      expect(() => renderer.renderToPng(minimalSprite)).toThrow('No sprite rendered');
    });

    it('should warn when scale option is used', async () => {
      await renderer.init();
      mockWasm.render_to_png.mockReturnValue(mockPngData);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      renderer.renderToPng(minimalSprite, undefined, { scale: 4 });

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

      renderer.renderToPng(minimalSprite, undefined, { scale: 1 });

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should wrap WASM errors', async () => {
      await renderer.init();
      mockWasm.render_to_png.mockImplementation(() => {
        throw new Error('WASM render error');
      });

      expect(() => renderer.renderToPng(minimalSprite)).toThrow(PixelsrcRenderError);
      expect(() => renderer.renderToPng(minimalSprite)).toThrow('Failed to render');
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
