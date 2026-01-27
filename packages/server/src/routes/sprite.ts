/**
 * Sprite Asset Routes
 *
 * API endpoints for serving character sprites from the asset fallback system.
 * Supports pre-generated archetypes and runtime LPC composition.
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  SpriteGenerator,
  ArchetypeMatcher,
  type CharacterSpec,
} from '../services/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// =============================================================================
// Constants
// =============================================================================

const ARCHETYPES_ROOT = join(__dirname, '..', '..', '..', '..', 'assets', 'archetypes');

/**
 * Palette presets available for sprite transformation
 */
const PALETTE_PRESETS = [
  'warm_heroic',
  'cool_villain',
  'gritty_worn',
  'festive',
  'noir',
  'horror',
] as const;

// =============================================================================
// Zod Schemas
// =============================================================================

const GetSpriteQuerySchema = z.object({
  palette: z.enum(PALETTE_PRESETS).optional(),
  hue: z.coerce.number().min(-180).max(180).optional(),
  saturation: z.coerce.number().min(0).max(2).optional(),
  brightness: z.coerce.number().min(0).max(2).optional(),
});

const GenerateSpriteBodySchema = z.object({
  body: z.enum(['male', 'female']),
  skinTone: z.enum(['light', 'medium', 'dark', 'green', 'blue', 'purple']),
  hair: z.object({
    style: z.string(),
    color: z.string(),
  }).optional(),
  armor: z.object({
    type: z.string(),
    color: z.string().optional(),
  }).optional(),
  weapon: z.string().optional(),
  accessories: z.array(z.string()).optional(),
});

const SearchArchetypesQuerySchema = z.object({
  race: z.string().optional(),
  gender: z.enum(['male', 'female']).optional(),
  archetype: z.string().optional(),
  tags: z.string().optional(), // comma-separated
  mood: z.string().optional(), // comma-separated
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

// =============================================================================
// Error Codes
// =============================================================================

const ErrorCodes = {
  SPRITE_NOT_FOUND: 'SPRITE_NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  GENERATION_FAILED: 'GENERATION_FAILED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string
) {
  return reply.status(statusCode).send({
    error: {
      code,
      message,
    },
  });
}

/**
 * Simple in-memory rate limiter
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 30) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) ?? [];

    // Remove old timestamps
    const recent = timestamps.filter(t => now - t < this.windowMs);

    if (recent.length >= this.maxRequests) {
      return false;
    }

    recent.push(now);
    this.requests.set(key, recent);
    return true;
  }
}

// =============================================================================
// Route Registration
// =============================================================================

export async function spriteRoutes(fastify: FastifyInstance): Promise<void> {
  const generator = new SpriteGenerator();
  const matcher = new ArchetypeMatcher();
  const rateLimiter = new RateLimiter(60000, 30); // 30 requests per minute

  // Try to load archetype manifest
  try {
    await matcher.loadManifest();
    fastify.log.info(`Loaded ${matcher.getCount()} archetype sprites`);
  } catch (error) {
    fastify.log.warn('Archetype manifest not loaded - run generate-archetype-library.ts first');
  }

  // ==========================================================================
  // GET /sprite/:id - Get pre-generated archetype sprite
  // ==========================================================================
  fastify.get('/sprite/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = request.params;
    const queryResult = GetSpriteQuerySchema.safeParse(request.query);

    if (!queryResult.success) {
      return sendError(
        reply,
        400,
        ErrorCodes.VALIDATION_ERROR,
        queryResult.error.message
      );
    }

    // Find sprite file
    const spritePath = join(ARCHETYPES_ROOT, `${id}.png`);
    if (!existsSync(spritePath)) {
      return sendError(
        reply,
        404,
        ErrorCodes.SPRITE_NOT_FOUND,
        `Sprite not found: ${id}`
      );
    }

    try {
      const imageBuffer = readFileSync(spritePath);

      // TODO: Apply palette shift when palette-shift.ts is merged
      // if (queryResult.data.palette || queryResult.data.hue || ...) {
      //   imageBuffer = await applyPaletteShift(imageBuffer, { ... });
      // }

      // Set caching headers (1 hour for browser, 1 day for CDN)
      reply.header('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      reply.header('Content-Type', 'image/png');
      return reply.send(imageBuffer);
    } catch (error) {
      fastify.log.error(error, 'Failed to read sprite');
      return sendError(
        reply,
        500,
        ErrorCodes.SERVICE_UNAVAILABLE,
        'Failed to read sprite'
      );
    }
  });

  // ==========================================================================
  // POST /sprite/generate - Runtime sprite composition
  // ==========================================================================
  fastify.post('/sprite/generate', async (request, reply) => {
    // Rate limiting by IP
    const clientIp = request.ip || 'unknown';
    if (!rateLimiter.isAllowed(clientIp)) {
      return sendError(
        reply,
        429,
        ErrorCodes.RATE_LIMITED,
        'Too many requests. Please wait before generating more sprites.'
      );
    }

    const bodyResult = GenerateSpriteBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return sendError(
        reply,
        400,
        ErrorCodes.VALIDATION_ERROR,
        bodyResult.error.message
      );
    }

    // Check if generator is ready
    if (!generator.isReady()) {
      return sendError(
        reply,
        503,
        ErrorCodes.SERVICE_UNAVAILABLE,
        'Sprite generator not ready. LPC assets may not be available.'
      );
    }

    try {
      const spec: CharacterSpec = bodyResult.data;
      const result = await generator.generate(spec);

      // Set caching headers
      reply.header('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      reply.header('Content-Type', 'image/png');
      reply.header('X-Cache-Key', result.cacheKey);
      return reply.send(result.data);
    } catch (error) {
      fastify.log.error(error, 'Failed to generate sprite');
      return sendError(
        reply,
        500,
        ErrorCodes.GENERATION_FAILED,
        error instanceof Error ? error.message : 'Failed to generate sprite'
      );
    }
  });

  // ==========================================================================
  // GET /sprite/search - Search archetype library
  // ==========================================================================
  fastify.get('/sprite/search', async (request, reply) => {
    const queryResult = SearchArchetypesQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return sendError(
        reply,
        400,
        ErrorCodes.VALIDATION_ERROR,
        queryResult.error.message
      );
    }

    if (!matcher.isReady()) {
      return sendError(
        reply,
        503,
        ErrorCodes.SERVICE_UNAVAILABLE,
        'Archetype library not loaded. Run generate-archetype-library.ts first.'
      );
    }

    const { race, gender, archetype, tags, mood, limit } = queryResult.data;

    const matches = matcher.findBestMatch(
      {
        race,
        gender,
        archetype,
        tags: tags?.split(',').map(t => t.trim()),
        mood: mood?.split(',').map(m => m.trim()),
      },
      limit
    );

    return reply.send({
      matches: matches.map(m => ({
        id: m.archetype.id,
        score: m.score,
        race: m.archetype.race,
        gender: m.archetype.gender,
        archetype: m.archetype.archetype,
        tags: m.archetype.tags,
        mood: m.archetype.mood,
      })),
      total: matches.length,
    });
  });

  // ==========================================================================
  // GET /sprite/metadata - Get library metadata
  // ==========================================================================
  fastify.get('/sprite/metadata', async (_request, reply) => {
    return reply.send({
      ready: matcher.isReady(),
      totalSprites: matcher.getCount(),
      races: matcher.getUniqueValues('race'),
      genders: matcher.getUniqueValues('gender'),
      archetypes: matcher.getUniqueValues('archetype'),
      palettePresets: PALETTE_PRESETS,
    });
  });
}
