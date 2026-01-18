/**
 * Pixelsrc Renderer Service
 *
 * Browser-based WASM rendering service for pixelsrc source. Provides methods to
 * render sprites and list available sprites, with frame caching for performance.
 */

import init, {
  render_to_png,
  list_sprites,
  init_panic_hook,
} from '@stiwi/pixelsrc-wasm';

/**
 * Options for rendering sprites
 */
export interface RenderOptions {
  /**
   * Scale factor for the rendered image.
   * Note: Currently not supported by the WASM module - reserved for future use.
   * @default 1
   */
  scale?: number;

  /**
   * Whether to bypass the cache for this render.
   * @default false
   */
  bypassCache?: boolean;
}

/**
 * Result of a render operation
 */
export interface RenderResult {
  /** PNG image data */
  data: Uint8Array;
  /** Name of the rendered sprite */
  spriteName: string;
  /** Whether the result was served from cache */
  fromCache: boolean;
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
 * Generate a cache key for a sprite render
 */
function generateCacheKey(source: string, spriteName?: string): string {
  // Use a simple hash of source + spriteName
  const content = `${spriteName ?? '__first__'}:${source}`;
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `pxl_${hash.toString(36)}`;
}

/**
 * Cached frame entry
 */
interface CacheEntry {
  data: Uint8Array;
  timestamp: number;
}

/**
 * Browser WASM-based renderer for pixelsrc source files.
 *
 * Usage:
 * ```typescript
 * const renderer = new PixelsrcRenderer();
 * await renderer.init();
 *
 * const sprites = renderer.listSprites(source);
 * const result = await renderer.render(source, 'hero_idle');
 * ```
 */
export class PixelsrcRenderer {
  private initialized = false;
  private cache: Map<string, CacheEntry> = new Map();
  private maxCacheSize: number;
  private cacheTTL: number;

  /**
   * Create a new PixelsrcRenderer instance.
   *
   * @param options Configuration options
   * @param options.maxCacheSize Maximum number of cached frames (default: 100)
   * @param options.cacheTTL Cache time-to-live in milliseconds (default: 5 minutes)
   */
  constructor(options: { maxCacheSize?: number; cacheTTL?: number } = {}) {
    this.maxCacheSize = options.maxCacheSize ?? 100;
    this.cacheTTL = options.cacheTTL ?? 5 * 60 * 1000;
  }

  /**
   * Initialize the WASM module. Must be called before any render operations.
   *
   * @param wasmPath Optional path to the WASM file. If not provided,
   *                 the default bundled location is used.
   */
  async init(wasmPath?: string): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize the WASM module
    // In browser environments, we can pass a URL or let it auto-detect
    if (wasmPath) {
      await init(wasmPath);
    } else {
      await init();
    }

    // Initialize panic hook for better error messages
    init_panic_hook();

    this.initialized = true;
  }

  /**
   * Ensure the renderer is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new PixelsrcRenderError(
        'PixelsrcRenderer not initialized. Call init() first.'
      );
    }
  }

  /**
   * List all sprite names defined in the source.
   *
   * @param source - JSONL string containing pixelsrc definitions
   * @returns Array of sprite names
   */
  listSprites(source: string): string[] {
    this.ensureInitialized();

    if (!source || source.trim().length === 0) {
      return [];
    }

    try {
      return list_sprites(source);
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
   * Results are cached for performance.
   *
   * @param source - JSONL string containing pixelsrc definitions
   * @param spriteName - Optional name of the sprite to render
   * @param options - Optional render options
   * @returns RenderResult with PNG data and metadata
   */
  render(
    source: string,
    spriteName?: string,
    options?: RenderOptions
  ): RenderResult {
    this.ensureInitialized();

    if (!source || source.trim().length === 0) {
      throw new PixelsrcRenderError('Source cannot be empty');
    }

    // Log scale option if provided (not yet supported in WASM)
    if (options?.scale && options.scale !== 1) {
      console.warn(
        `PixelsrcRenderer: scale option (${options.scale}) is not yet supported in WASM module. Rendering at 1x scale.`
      );
    }

    // Check cache unless bypassed
    const cacheKey = generateCacheKey(source, spriteName);
    if (!options?.bypassCache) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return {
          data: cached,
          spriteName: spriteName ?? this.getFirstSpriteName(source),
          fromCache: true,
        };
      }
    }

    try {
      // If a specific sprite is requested, filter the source
      const sourceToRender = spriteName
        ? this.filterSourceForSprite(source, spriteName)
        : source;

      const png = render_to_png(sourceToRender);

      if (!png || png.length === 0) {
        throw new PixelsrcRenderError(
          spriteName
            ? `No sprite rendered for name: ${spriteName}`
            : 'No sprite rendered',
          source,
          spriteName
        );
      }

      // Cache the result
      this.addToCache(cacheKey, png);

      return {
        data: png,
        spriteName: spriteName ?? this.getFirstSpriteName(source),
        fromCache: false,
      };
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
   * Get the first sprite name from source (for result metadata)
   */
  private getFirstSpriteName(source: string): string {
    const sprites = this.listSprites(source);
    return sprites[0] ?? 'unknown';
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
   * Get a cached entry if it exists and is not expired
   */
  private getFromCache(key: string): Uint8Array | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Add an entry to the cache, evicting oldest entries if necessary
   */
  private addToCache(key: string, data: Uint8Array): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.findOldestCacheKey();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Find the oldest cache entry key
   */
  private findOldestCacheKey(): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * Clear the frame cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
    };
  }

  /**
   * Check if the renderer has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

export default PixelsrcRenderer;
