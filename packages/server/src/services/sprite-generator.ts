/**
 * Sprite Generator Service
 *
 * Server-side sprite composition using Sharp for LPC (Liberated Pixel Cup) assets.
 * Composites character sprites from layered PNG files for the asset fallback system.
 */

import sharp from 'sharp';
import { existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Path to the LPC layers directory
 */
const LPC_ROOT = join(__dirname, '..', '..', '..', 'assets', 'lpc-layers');

/**
 * Skin tone options available for character bodies
 */
export type SkinTone = 'light' | 'medium' | 'dark' | 'green' | 'blue' | 'purple';

/**
 * Body type options
 */
export type BodyType = 'male' | 'female';

/**
 * Hair specification
 */
export interface HairSpec {
  /** Hair style (e.g., 'long', 'short', 'mohawk') */
  style: string;
  /** Hair color (e.g., 'brown', 'black', 'blonde', 'red') */
  color: string;
}

/**
 * Armor specification
 */
export interface ArmorSpec {
  /** Armor type (e.g., 'leather', 'chainmail', 'plate') */
  type: string;
  /** Optional color variant */
  color?: string;
}

/**
 * Full character specification for sprite generation
 */
export interface CharacterSpec {
  /** Body type */
  body: BodyType;
  /** Skin tone */
  skinTone: SkinTone;
  /** Hair style and color (optional - some characters are bald) */
  hair?: HairSpec;
  /** Armor/clothing (optional) */
  armor?: ArmorSpec;
  /** Weapon name (optional) */
  weapon?: string;
  /** Additional accessories (optional) */
  accessories?: string[];
}

/**
 * Result of sprite generation
 */
export interface SpriteResult {
  /** PNG image data */
  data: Buffer;
  /** Spec used to generate (for caching key) */
  spec: CharacterSpec;
  /** Cache key for this sprite */
  cacheKey: string;
}

/**
 * Error thrown when sprite generation fails
 */
export class SpriteGeneratorError extends Error {
  constructor(
    message: string,
    public readonly spec?: CharacterSpec,
    public readonly missingLayer?: string
  ) {
    super(message);
    this.name = 'SpriteGeneratorError';
  }
}

/**
 * Generate a cache key from a CharacterSpec
 */
function specToCacheKey(spec: CharacterSpec): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(spec));
  return `sprite:${hash.digest('hex').substring(0, 16)}`;
}

/**
 * LPC Sprite Generator
 *
 * Composites character sprites from layered PNG files using Sharp.
 * Layers are applied in order: body → hair → armor → weapon → accessories
 *
 * Usage:
 * ```typescript
 * const generator = new SpriteGenerator();
 *
 * const sprite = await generator.generate({
 *   body: 'male',
 *   skinTone: 'medium',
 *   hair: { style: 'short', color: 'brown' },
 *   armor: { type: 'chainmail' },
 *   weapon: 'sword'
 * });
 * ```
 */
export class SpriteGenerator {
  private cache: Map<string, Buffer> = new Map();
  private maxCacheSize: number;

  constructor(options?: { maxCacheSize?: number }) {
    this.maxCacheSize = options?.maxCacheSize ?? 100;
  }

  /**
   * Generate a character sprite by compositing layers
   *
   * @param spec - Character specification
   * @returns SpriteResult with PNG buffer
   */
  async generate(spec: CharacterSpec): Promise<SpriteResult> {
    const cacheKey = specToCacheKey(spec);

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { data: cached, spec, cacheKey };
    }

    // Build layer stack (order matters - bottom to top)
    const layers = await this.buildLayerStack(spec);

    if (layers.length === 0) {
      throw new SpriteGeneratorError('No valid layers found for spec', spec);
    }

    // Composite all layers
    const result = await this.compositeLayers(layers);

    // Cache the result
    this.cacheResult(cacheKey, result);

    return { data: result, spec, cacheKey };
  }

  /**
   * Build the layer stack from a CharacterSpec
   */
  private async buildLayerStack(spec: CharacterSpec): Promise<string[]> {
    const layers: string[] = [];

    // 1. Base body layer
    const bodyPath = this.findLayer('body', spec.body, spec.skinTone);
    if (bodyPath) {
      layers.push(bodyPath);
    } else {
      throw new SpriteGeneratorError(
        `Body layer not found: body/${spec.body}/${spec.skinTone}`,
        spec,
        `body/${spec.body}/${spec.skinTone}`
      );
    }

    // 2. Hair layer (optional)
    if (spec.hair) {
      const hairPath = this.findLayer('hair', spec.hair.style, spec.hair.color);
      if (hairPath) {
        layers.push(hairPath);
      }
      // Hair is optional, don't throw if not found
    }

    // 3. Armor layer (optional)
    if (spec.armor) {
      const armorPath = this.findLayer(
        'armor',
        spec.armor.type,
        spec.armor.color ?? 'default'
      );
      if (armorPath) {
        layers.push(armorPath);
      }
    }

    // 4. Weapon layer (optional)
    if (spec.weapon) {
      const weaponPath = this.findLayer('weapons', spec.weapon);
      if (weaponPath) {
        layers.push(weaponPath);
      }
    }

    // 5. Accessories (optional)
    if (spec.accessories) {
      for (const accessory of spec.accessories) {
        const accessoryPath = this.findLayer('accessories', accessory);
        if (accessoryPath) {
          layers.push(accessoryPath);
        }
      }
    }

    return layers;
  }

  /**
   * Find a layer file, trying multiple path patterns
   */
  private findLayer(category: string, ...parts: string[]): string | null {
    const basePath = join(LPC_ROOT, category);

    // Try different path patterns
    const patterns = [
      // Full path: category/part1/part2.png
      join(basePath, ...parts.slice(0, -1), `${parts[parts.length - 1]}.png`),
      // Nested: category/part1/part2/default.png
      join(basePath, ...parts, 'default.png'),
      // Flat: category/part1_part2.png
      join(basePath, `${parts.join('_')}.png`),
      // Single part: category/part1.png
      join(basePath, `${parts[0]}.png`),
    ];

    for (const pattern of patterns) {
      if (existsSync(pattern)) {
        return pattern;
      }
    }

    return null;
  }

  /**
   * Composite multiple layer images into a single PNG
   */
  private async compositeLayers(layerPaths: string[]): Promise<Buffer> {
    if (layerPaths.length === 0) {
      throw new SpriteGeneratorError('No layers to composite');
    }

    if (layerPaths.length === 1) {
      return sharp(layerPaths[0]).png().toBuffer();
    }

    // Start with the base layer
    let composite = sharp(layerPaths[0]);

    // Get dimensions from base layer
    const metadata = await composite.metadata();
    const width = metadata.width ?? 64;
    const height = metadata.height ?? 64;

    // Add remaining layers on top
    const overlays: sharp.OverlayOptions[] = [];
    for (const layerPath of layerPaths.slice(1)) {
      overlays.push({
        input: layerPath,
        blend: 'over' as const,
        top: 0,
        left: 0,
      });
    }

    // Ensure canvas size and composite
    return composite
      .resize(width, height, { fit: 'fill' })
      .composite(overlays)
      .png()
      .toBuffer();
  }

  /**
   * Cache a generated sprite, evicting old entries if needed
   */
  private cacheResult(key: string, data: Buffer): void {
    // Simple LRU-like eviction: remove oldest entries when full
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, data);
  }

  /**
   * Clear the sprite cache
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
   * List available options for a category
   */
  listAvailable(category: 'body' | 'hair' | 'armor' | 'weapons' | 'accessories'): string[] {
    const categoryPath = join(LPC_ROOT, category);
    if (!existsSync(categoryPath)) {
      return [];
    }

    try {
      const entries = readdirSync(categoryPath, { withFileTypes: true });
      const results: string[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          results.push(entry.name);
        } else if (entry.isFile() && entry.name.endsWith('.png')) {
          results.push(entry.name.replace('.png', ''));
        }
      }

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Check if the LPC assets directory exists and has content
   */
  isReady(): boolean {
    return existsSync(LPC_ROOT) && existsSync(join(LPC_ROOT, 'body'));
  }

  /**
   * Get the LPC root path (for debugging/diagnostics)
   */
  getLpcRoot(): string {
    return LPC_ROOT;
  }
}

/**
 * Singleton instance for convenience
 */
let defaultGenerator: SpriteGenerator | null = null;

/**
 * Get the default SpriteGenerator instance
 */
export function getSpriteGenerator(): SpriteGenerator {
  if (!defaultGenerator) {
    defaultGenerator = new SpriteGenerator();
  }
  return defaultGenerator;
}

/**
 * Generate a character sprite using the default generator
 */
export async function generateCharacterSprite(
  spec: CharacterSpec
): Promise<Buffer> {
  const generator = getSpriteGenerator();
  const result = await generator.generate(spec);
  return result.data;
}
