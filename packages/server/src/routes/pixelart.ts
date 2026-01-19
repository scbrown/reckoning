/**
 * Pixel Art Routes
 *
 * API endpoints for pixel art retrieval and regeneration.
 * Supports character, NPC, scene, palette, and effect sprites.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getDatabase } from '../db/index.js';
import { GameRepository } from '../db/repositories/index.js';
import { PixelsrcProjectManager } from '../services/pixelsrc/project.js';
import {
  PixelsrcAIGenerator,
  PixelsrcValidator,
  PixelsrcRepairer,
  PixelsrcRenderer,
} from '../services/pixelsrc/index.js';
import { ClaudeCodeCLI } from '../services/ai/index.js';

// =============================================================================
// Zod Schemas
// =============================================================================

const EntityTypeEnum = z.enum(['character', 'npc', 'scene', 'palette', 'effect']);

const PixelArtParamsSchema = z.object({
  gameId: z.string().uuid(),
  entityType: EntityTypeEnum,
  entityId: z.string().min(1).max(200),
});

const GetPixelArtQuerySchema = z.object({
  format: z.enum(['source', 'png']).optional().default('source'),
  sprite: z.string().optional(),
});

const RegenerateBodySchema = z.object({
  description: z.string().max(2000).optional(),
  name: z.string().max(200).optional(),
  archetype: z.string().max(100).optional(),
  timeOfDay: z.enum(['dawn', 'day', 'dusk', 'night']).optional(),
  weather: z.enum(['clear', 'rain', 'storm', 'fog', 'snow']).optional(),
  theme: z.string().max(200).optional(),
  colorCount: z.number().int().min(2).max(32).optional(),
  style: z.enum(['warm', 'cool', 'vibrant', 'muted', 'dark', 'light']).optional(),
  characterClass: z.string().max(100).optional(),
  mood: z.enum(['neutral', 'happy', 'angry', 'sad', 'determined', 'fearful']).optional(),
});

// =============================================================================
// Types
// =============================================================================

type EntityType = z.infer<typeof EntityTypeEnum>;

const ENTITY_TYPE_TO_DIR: Record<EntityType, string> = {
  character: 'src/characters',
  npc: 'src/npcs',
  scene: 'src/scenes',
  palette: 'src/palettes',
  effect: 'src/effects',
};

// =============================================================================
// Error Codes
// =============================================================================

const ErrorCodes = {
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  PIXEL_ART_NOT_FOUND: 'PIXEL_ART_NOT_FOUND',
  INVALID_ENTITY_TYPE: 'INVALID_ENTITY_TYPE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  GENERATION_FAILED: 'GENERATION_FAILED',
  RENDER_FAILED: 'RENDER_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
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

function validateWithZod<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  reply: FastifyReply
): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ');
    sendError(reply, 400, ErrorCodes.VALIDATION_ERROR, errors);
    return null;
  }
  return result.data;
}

function getFilePath(entityType: EntityType, entityId: string): string {
  const dir = ENTITY_TYPE_TO_DIR[entityType];
  return `${dir}/${entityId}.pxl`;
}

// =============================================================================
// Routes
// =============================================================================

export async function pixelartRoutes(fastify: FastifyInstance) {
  const db = getDatabase();
  const gameRepo = new GameRepository(db);
  const projectManager = new PixelsrcProjectManager();
  const aiGenerator = new PixelsrcAIGenerator();
  const validator = new PixelsrcValidator();
  const renderer = new PixelsrcRenderer();
  const aiProvider = new ClaudeCodeCLI();
  const repairer = new PixelsrcRepairer(aiProvider);
  repairer.setValidator(validator);

  // Initialize validator and renderer
  await validator.init();
  await renderer.init();

  /**
   * GET /api/pixelart/:gameId/:entityType/:entityId
   * Retrieve pixel art source or rendered PNG
   */
  fastify.get<{
    Params: { gameId: string; entityType: string; entityId: string };
    Querystring: Record<string, string>;
  }>(
    '/:gameId/:entityType/:entityId',
    async (
      request: FastifyRequest<{
        Params: { gameId: string; entityType: string; entityId: string };
        Querystring: Record<string, string>;
      }>,
      reply: FastifyReply
    ) => {
      const params = validateWithZod(PixelArtParamsSchema, request.params, reply);
      if (!params) return;

      const query = validateWithZod(GetPixelArtQuerySchema, request.query, reply);
      if (!query) return;

      try {
        // Verify game exists
        const game = gameRepo.findById(params.gameId);
        if (!game) {
          return sendError(reply, 404, ErrorCodes.GAME_NOT_FOUND, `Game not found: ${params.gameId}`);
        }

        // Build file path
        const filePath = getFilePath(params.entityType, params.entityId);

        // Check if file exists
        const exists = await projectManager.fileExists(params.gameId, filePath);
        if (!exists) {
          return sendError(
            reply,
            404,
            ErrorCodes.PIXEL_ART_NOT_FOUND,
            `Pixel art not found: ${params.entityType}/${params.entityId}`
          );
        }

        // Read the file
        const source = await projectManager.readFile(params.gameId, filePath);

        // Return based on format
        if (query.format === 'png') {
          const pngData = renderer.renderToPng(source, query.sprite);
          return reply
            .header('Content-Type', 'image/png')
            .header('Content-Disposition', `inline; filename="${params.entityId}.png"`)
            .send(Buffer.from(pngData));
        }

        // Return source (JSONL)
        const sprites = renderer.listSprites(source);
        return reply.send({
          entityType: params.entityType,
          entityId: params.entityId,
          source,
          sprites,
        });
      } catch (error) {
        request.log.error(error, 'Failed to retrieve pixel art');
        if (error instanceof Error && error.message.includes('not found')) {
          return sendError(reply, 404, ErrorCodes.PIXEL_ART_NOT_FOUND, error.message);
        }
        return sendError(reply, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to retrieve pixel art');
      }
    }
  );

  /**
   * POST /api/pixelart/:gameId/:entityType/:entityId/regenerate
   * Regenerate pixel art using AI with full generation/validation loop
   */
  fastify.post<{
    Params: { gameId: string; entityType: string; entityId: string };
    Body: unknown;
  }>(
    '/:gameId/:entityType/:entityId/regenerate',
    async (
      request: FastifyRequest<{
        Params: { gameId: string; entityType: string; entityId: string };
        Body: unknown;
      }>,
      reply: FastifyReply
    ) => {
      const params = validateWithZod(PixelArtParamsSchema, request.params, reply);
      if (!params) return;

      const body = validateWithZod(RegenerateBodySchema, request.body ?? {}, reply);
      if (!body) return;

      try {
        // Verify game exists
        const game = gameRepo.findById(params.gameId);
        if (!game) {
          return sendError(reply, 404, ErrorCodes.GAME_NOT_FOUND, `Game not found: ${params.gameId}`);
        }

        // Ensure project directory exists
        await projectManager.initialize(params.gameId);

        // Generate based on entity type
        let generationResult;
        const entityName = body.name ?? params.entityId;
        const description = body.description ?? `A ${params.entityType} named ${entityName}`;

        switch (params.entityType) {
          case 'character':
          case 'npc': {
            const portraitContext: Parameters<typeof aiGenerator.generatePortrait>[0] = {
              name: entityName,
              description,
            };
            if (body.characterClass !== undefined) portraitContext.characterClass = body.characterClass;
            if (body.mood !== undefined) portraitContext.mood = body.mood;
            generationResult = await aiGenerator.generatePortrait(portraitContext);
            break;
          }
          case 'scene': {
            type SceneContext = Parameters<typeof aiGenerator.generateScene>[0];
            const sceneContext: SceneContext = {
              name: entityName,
              description,
            };
            if (body.archetype !== undefined) {
              (sceneContext as { archetype: SceneContext['archetype'] }).archetype =
                body.archetype as SceneContext['archetype'];
            }
            if (body.timeOfDay !== undefined) sceneContext.timeOfDay = body.timeOfDay;
            if (body.weather !== undefined) sceneContext.weather = body.weather;
            generationResult = await aiGenerator.generateScene(sceneContext);
            break;
          }
          case 'palette': {
            const paletteContext: Parameters<typeof aiGenerator.generatePalette>[0] = {
              name: entityName,
              theme: body.theme ?? description,
            };
            if (body.colorCount !== undefined) paletteContext.colorCount = body.colorCount;
            if (body.style !== undefined) paletteContext.style = body.style;
            generationResult = await aiGenerator.generatePalette(paletteContext);
            break;
          }
          case 'effect': {
            // Effects use the scene generator with adjusted context
            generationResult = await aiGenerator.generateScene({
              name: entityName,
              description: `Visual effect: ${description}`,
            });
            break;
          }
        }

        if (!generationResult.ok) {
          return sendError(
            reply,
            500,
            ErrorCodes.GENERATION_FAILED,
            `AI generation failed: ${generationResult.error.message}`
          );
        }

        let source = generationResult.value.source;

        // Validate the generated source
        const validationResult = await validator.validateAsync(source);

        if (!validationResult.valid) {
          // Try to repair invalid source
          request.log.info(
            { errors: validationResult.errors },
            'Generated source has validation errors, attempting repair'
          );

          const repairContext: Parameters<typeof repairer.repair>[2] = {
            description,
          };
          if (body.archetype !== undefined) repairContext.archetype = body.archetype;
          const repairResult = await repairer.repair(source, validationResult, repairContext);

          if (!repairResult.ok) {
            return sendError(
              reply,
              500,
              ErrorCodes.GENERATION_FAILED,
              `Repair failed: ${repairResult.error.message}`
            );
          }

          if (!repairResult.value.success) {
            return sendError(
              reply,
              500,
              ErrorCodes.GENERATION_FAILED,
              `Failed to generate valid pixel art after ${repairResult.value.attempts} repair attempts. ` +
                `Remaining errors: ${repairResult.value.remainingErrors.map(e => e.message).join('; ')}`
            );
          }

          source = repairResult.value.source;
        }

        // Save to filesystem
        const filePath = getFilePath(params.entityType, params.entityId);
        await projectManager.writeFile(params.gameId, filePath, source);

        // Get sprites from the source
        const sprites = renderer.listSprites(source);

        return reply.status(201).send({
          entityType: params.entityType,
          entityId: params.entityId,
          source,
          sprites,
          generated: true,
          durationMs: generationResult.value.durationMs,
        });
      } catch (error) {
        request.log.error(error, 'Failed to regenerate pixel art');
        return sendError(reply, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to regenerate pixel art');
      }
    }
  );

  /**
   * GET /api/pixelart/:gameId/:entityType
   * List all pixel art of a specific type for a game
   */
  fastify.get<{
    Params: { gameId: string; entityType: string };
  }>(
    '/:gameId/:entityType',
    async (
      request: FastifyRequest<{
        Params: { gameId: string; entityType: string };
      }>,
      reply: FastifyReply
    ) => {
      const paramsSchema = z.object({
        gameId: z.string().uuid(),
        entityType: EntityTypeEnum,
      });

      const params = validateWithZod(paramsSchema, request.params, reply);
      if (!params) return;

      try {
        // Verify game exists
        const game = gameRepo.findById(params.gameId);
        if (!game) {
          return sendError(reply, 404, ErrorCodes.GAME_NOT_FOUND, `Game not found: ${params.gameId}`);
        }

        // Check if project exists
        const projectExists = await projectManager.projectExists(params.gameId);
        if (!projectExists) {
          return reply.send({ entityType: params.entityType, items: [] });
        }

        // List files in the directory
        // Note: This is a simplified implementation. In production, you might want
        // to add directory listing to PixelsrcProjectManager
        const items: { entityId: string; path: string }[] = [];

        // For now, return empty array since we don't have directory listing
        // This endpoint provides structure for future implementation
        return reply.send({
          entityType: params.entityType,
          items,
        });
      } catch (error) {
        request.log.error(error, 'Failed to list pixel art');
        return sendError(reply, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to list pixel art');
      }
    }
  );
}
