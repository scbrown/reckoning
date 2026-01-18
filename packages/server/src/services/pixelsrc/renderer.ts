/**
 * Pixelsrc Renderer Service
 *
 * WASM-based rendering service for pixelsrc source. Provides methods to render
 * sprites to PNG and list available sprites in a source.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Types from @stiwi/pixelsrc-wasm
interface PixelsrcWasm {
  render_to_png: (jsonl: string) => Uint8Array;
  list_sprites: (jsonl: string) => string[];
  validate: (jsonl: string) => string[];
  init_panic_hook: () => void;
}

/**
 * Options for rendering sprites to PNG
 */
export interface RenderOptions {
  /**
   * Scale factor for the rendered image.
   * Note: Currently not supported by the WASM module - reserved for future use.
   * @default 1
   */
  scale?: number;
}

/**
 * Result of a render operation
 */
export interface RenderResult {
  /** PNG image data */
  data: Uint8Array;
  /** Name of the rendered sprite */
  spriteName: string;
}

/**
 * Error thrown when rendering fails
 */
export class PixelsrcRenderError extends Error {
  constructor(
    message: string,
    public readonly source?: string,
    public readonly spriteName?: string
  ) {
    super(message);
    this.name = 'PixelsrcRenderError';
  }
}

/**
 * WASM-based renderer for pixelsrc source files.
 *
 * Usage:
 * ```typescript
 * const renderer = new PixelsrcRenderer();
 * await renderer.init();
 *
 * const sprites = renderer.listSprites(source);
 * const png = renderer.renderToPng(source, 'hero_idle');
 * ```
 */
export class PixelsrcRenderer {
  private wasmModule: PixelsrcWasm | null = null;
  private initialized = false;

  /**
   * Initialize the WASM module. Must be called before any render operations.
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Dynamic import for WASM module
    const wasm = await import('@stiwi/pixelsrc-wasm');

    // Load WASM file for Node.js environment
    // The WASM binary needs to be loaded manually in Node.js
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const wasmPath = join(
      __dirname,
      '..',
      '..',
      '..',
      'node_modules',
      '@stiwi',
      'pixelsrc-wasm',
      'pkg',
      'pixelsrc_bg.wasm'
    );

    const wasmBytes = readFileSync(wasmPath);
    await wasm.default(wasmBytes);

    // Initialize panic hook for better error messages
    wasm.init_panic_hook();

    this.wasmModule = wasm as unknown as PixelsrcWasm;
    this.initialized = true;
  }

  /**
   * Ensure the renderer is initialized
   */
  private ensureInitialized(): PixelsrcWasm {
    if (!this.wasmModule) {
      throw new PixelsrcRenderError(
        'PixelsrcRenderer not initialized. Call init() first.'
      );
    }
    return this.wasmModule;
  }

  /**
   * List all sprite names defined in the source.
   *
   * @param source - JSONL string containing pixelsrc definitions
   * @returns Array of sprite names
   */
  listSprites(source: string): string[] {
    const wasm = this.ensureInitialized();

    if (!source || source.trim().length === 0) {
      return [];
    }

    try {
      return wasm.list_sprites(source);
    } catch (error) {
      throw new PixelsrcRenderError(
        `Failed to list sprites: ${error instanceof Error ? error.message : String(error)}`,
        source
      );
    }
  }

  /**
   * Render a sprite to PNG bytes.
   *
   * If no sprite name is provided, renders the first sprite in the source.
   * If a sprite name is provided, filters the source to render only that sprite.
   *
   * @param source - JSONL string containing pixelsrc definitions
   * @param spriteName - Optional name of the sprite to render
   * @param options - Optional render options (scale is reserved for future use)
   * @returns PNG image data as Uint8Array
   */
  renderToPng(
    source: string,
    spriteName?: string,
    options?: RenderOptions
  ): Uint8Array {
    const wasm = this.ensureInitialized();

    if (!source || source.trim().length === 0) {
      throw new PixelsrcRenderError('Source cannot be empty');
    }

    // Log scale option if provided (not yet supported in WASM)
    if (options?.scale && options.scale !== 1) {
      console.warn(
        `PixelsrcRenderer: scale option (${options.scale}) is not yet supported in WASM module. Rendering at 1x scale.`
      );
    }

    try {
      // If a specific sprite is requested, filter the source
      const sourceToRender = spriteName
        ? this.filterSourceForSprite(source, spriteName)
        : source;

      const png = wasm.render_to_png(sourceToRender);

      if (!png || png.length === 0) {
        throw new PixelsrcRenderError(
          spriteName
            ? `No sprite rendered for name: ${spriteName}`
            : 'No sprite rendered',
          source,
          spriteName
        );
      }

      return png;
    } catch (error) {
      if (error instanceof PixelsrcRenderError) {
        throw error;
      }
      throw new PixelsrcRenderError(
        `Failed to render${spriteName ? ` sprite "${spriteName}"` : ''}: ${error instanceof Error ? error.message : String(error)}`,
        source,
        spriteName
      );
    }
  }

  /**
   * Filter source to include only palette definitions and the requested sprite.
   *
   * The WASM render_to_png() function renders the first sprite it finds.
   * To render a specific sprite, we filter the source to include only:
   * 1. All palette definitions (needed for color resolution)
   * 2. The requested sprite definition
   *
   * @param source - Original JSONL source
   * @param spriteName - Name of the sprite to keep
   * @returns Filtered JSONL source
   */
  private filterSourceForSprite(source: string, spriteName: string): string {
    const lines = source.split('\n').filter((line) => line.trim().length > 0);
    const filteredLines: string[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);

        // Keep all palette definitions
        if (parsed.type === 'palette') {
          filteredLines.push(line);
          continue;
        }

        // Keep only the requested sprite
        if (parsed.type === 'sprite' && parsed.name === spriteName) {
          filteredLines.push(line);
        }

        // Keep variants and compositions that reference the sprite
        if (
          parsed.type === 'variant' &&
          (parsed.name === spriteName || parsed.base === spriteName)
        ) {
          filteredLines.push(line);
        }

        if (parsed.type === 'composition' && parsed.name === spriteName) {
          filteredLines.push(line);
        }
      } catch {
        // Skip malformed lines
      }
    }

    if (
      !filteredLines.some((line) => {
        try {
          const parsed = JSON.parse(line);
          return (
            (parsed.type === 'sprite' ||
              parsed.type === 'variant' ||
              parsed.type === 'composition') &&
            parsed.name === spriteName
          );
        } catch {
          return false;
        }
      })
    ) {
      throw new PixelsrcRenderError(
        `Sprite "${spriteName}" not found in source`,
        source,
        spriteName
      );
    }

    return filteredLines.join('\n');
  }

  /**
   * Check if the renderer has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
