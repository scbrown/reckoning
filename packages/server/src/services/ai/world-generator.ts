/**
 * World Generation Pipeline
 *
 * Generates initial game worlds based on party composition using AI.
 */

import { Ok, Err, type Result } from '@reckoning/shared';
import type { Party, Area, NPC, NPCDisposition, PixelArtRef } from '@reckoning/shared/game';
import type { AIProvider } from './types.js';
import type { AreaRepository } from '../../db/repositories/area-repository.js';
import {
  WORLD_GENERATION_SCHEMA,
  safeParseWorldGenerationOutput,
  type WorldGenerationOutput,
} from './schemas.js';
import { buildWorldPrompt, type WorldGenerationContext } from './prompts/world.js';
import {
  PixelsrcGenerator,
  PixelsrcAIGenerator,
  PixelsrcValidator,
  PixelsrcRepairer,
  PixelsrcVisualValidator,
  PixelsrcProjectManager,
  type SceneGenerationContext,
} from '../pixelsrc/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for world generation
 */
export interface WorldGenerationOptions {
  /** Optional theme hint for the world */
  theme?: string;
  /** Number of areas to generate (default 3) */
  areaCount?: number;
  /** Game ID for pixel art file storage (required if enablePixelArtGeneration is true) */
  gameId?: string;
  /** Whether to generate actual pixel art files (default: false - only generates refs) */
  enablePixelArtGeneration?: boolean;
  /** Skip visual validation for faster generation (default: false) */
  skipVisualValidation?: boolean;
}

/**
 * Result of world generation
 */
export interface GeneratedWorld {
  /** Name of the generated world */
  worldName: string;
  /** Description of the world theme/atmosphere */
  worldDescription: string;
  /** ID of the starting area */
  startingAreaId: string;
  /** All generated areas with full details */
  areas: Area[];
  /** All generated NPCs */
  npcs: NPC[];
  /** Story hooks for the DM */
  storyHooks: string[];
}

/**
 * Error from world generation
 */
export interface WorldGenerationError {
  code: 'AI_ERROR' | 'PARSE_ERROR' | 'VALIDATION_ERROR' | 'DATABASE_ERROR';
  message: string;
  retryable: boolean;
}

// =============================================================================
// WorldGenerator Class
// =============================================================================

/**
 * Generates initial game worlds based on party composition.
 *
 * The generator:
 * 1. Builds a prompt based on party members and optional theme
 * 2. Calls the AI provider with the world generation schema
 * 3. Parses and validates the AI response
 * 4. Persists areas, NPCs, and objects to the database
 * 5. Optionally generates pixel art with full validation loop
 * 6. Returns the complete generated world for DM review
 */
export class WorldGenerator {
  private pixelsrcGenerator: PixelsrcGenerator;
  private pixelsrcAIGenerator: PixelsrcAIGenerator;
  private pixelsrcValidator: PixelsrcValidator;
  private pixelsrcRepairer: PixelsrcRepairer;
  private pixelsrcVisualValidator: PixelsrcVisualValidator;
  private pixelsrcProjectManager: PixelsrcProjectManager;
  private pixelsrcInitialized = false;

  constructor(
    private aiProvider: AIProvider,
    private areaRepo: AreaRepository
  ) {
    this.pixelsrcGenerator = new PixelsrcGenerator();
    this.pixelsrcAIGenerator = new PixelsrcAIGenerator();
    this.pixelsrcValidator = new PixelsrcValidator();
    this.pixelsrcRepairer = new PixelsrcRepairer(aiProvider);
    this.pixelsrcVisualValidator = new PixelsrcVisualValidator();
    this.pixelsrcProjectManager = new PixelsrcProjectManager();

    // Connect validator to repairer for re-validation
    this.pixelsrcRepairer.setValidator(this.pixelsrcValidator);
  }

  /**
   * Initialize pixelsrc services (WASM modules).
   * Called automatically on first pixel art generation.
   */
  private async initializePixelsrc(): Promise<void> {
    if (this.pixelsrcInitialized) return;

    await Promise.all([
      this.pixelsrcValidator.init(),
      this.pixelsrcVisualValidator.init(),
    ]);
    this.pixelsrcInitialized = true;
  }

  /**
   * Generate a new world for a party
   *
   * @param party - The party for whom the world is being generated
   * @param options - Generation options
   * @returns Result with GeneratedWorld on success, WorldGenerationError on failure
   */
  async generate(
    party: Party,
    options?: WorldGenerationOptions
  ): Promise<Result<GeneratedWorld, WorldGenerationError>> {
    console.log(`[WorldGenerator] Starting world generation for party ${party.id}`);
    const startTime = Date.now();

    // Build the prompt
    const context: WorldGenerationContext = {
      party,
      areaCount: options?.areaCount ?? 3,
    };
    // Only include theme if defined (exactOptionalPropertyTypes)
    if (options?.theme !== undefined) {
      context.theme = options.theme;
    }
    const prompt = buildWorldPrompt(context);
    console.log(`[WorldGenerator] Prompt built (${prompt.combined.length} chars)`);

    // Call AI provider
    console.log('[WorldGenerator] Calling AI provider with world generation schema...');
    const aiResult = await this.aiProvider.execute({
      prompt: prompt.combined,
      outputSchema: WORLD_GENERATION_SCHEMA,
    });

    if (!aiResult.ok) {
      const elapsed = Date.now() - startTime;
      console.error(`[WorldGenerator] AI error after ${elapsed}ms: ${aiResult.error.message}`);
      return Err({
        code: 'AI_ERROR',
        message: aiResult.error.message,
        retryable: aiResult.error.retryable,
      });
    }

    // Parse the response
    const elapsed = Date.now() - startTime;
    console.log(`[WorldGenerator] AI response received after ${elapsed}ms`);

    const parsed = this.parseResponse(aiResult.value.content);
    if (!parsed) {
      return Err({
        code: 'PARSE_ERROR',
        message: 'Failed to parse world generation response',
        retryable: true,
      });
    }

    // Validate the world structure
    const validation = this.validateWorld(parsed);
    if (!validation.valid) {
      return Err({
        code: 'VALIDATION_ERROR',
        message: validation.error,
        retryable: true,
      });
    }

    // Persist to database
    try {
      const world = this.persistWorld(parsed);
      console.log(`[WorldGenerator] World generation complete: ${world.worldName}`);
      console.log(`[WorldGenerator] Created ${world.areas.length} areas, ${world.npcs.length} NPCs`);

      // Generate pixel art if enabled (failures don't block)
      if (options?.enablePixelArtGeneration && options.gameId) {
        await this.generatePixelArtForAreas(world.areas, parsed, options);
      }

      return Ok(world);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Database error';
      console.error(`[WorldGenerator] Database error: ${message}`);
      return Err({
        code: 'DATABASE_ERROR',
        message,
        retryable: false,
      });
    }
  }

  /**
   * Parse AI response into WorldGenerationOutput
   */
  private parseResponse(response: string): WorldGenerationOutput | null {
    const trimmed = response.trim();

    // Try to extract JSON from markdown code blocks
    let jsonStr = trimmed;
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      // Try to find JSON object in the response
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (jsonMatch && jsonMatch[0]) {
        jsonStr = jsonMatch[0];
      }
    }

    try {
      let parsed = JSON.parse(jsonStr) as Record<string, unknown>;

      // Handle Claude CLI wrapper format
      if (
        parsed.type === 'result' &&
        typeof parsed.structured_output === 'object' &&
        parsed.structured_output !== null
      ) {
        console.log('[WorldGenerator] Detected CLI wrapper format, extracting structured_output');
        parsed = parsed.structured_output as Record<string, unknown>;
      }

      // Use Zod schema for validation
      const result = safeParseWorldGenerationOutput(parsed);
      if (!result) {
        console.log('[WorldGenerator] Zod validation failed');
        return null;
      }

      return result;
    } catch (e) {
      console.log(
        `[WorldGenerator] JSON parse error: ${e instanceof Error ? e.message : 'Unknown'}`
      );
      return null;
    }
  }

  /**
   * Validate the generated world structure
   */
  private validateWorld(world: WorldGenerationOutput): { valid: boolean; error: string } {
    // Check starting area exists
    const startingAreaExists = world.areas.some(a => a.id === world.startingAreaId);
    if (!startingAreaExists) {
      return {
        valid: false,
        error: `Starting area '${world.startingAreaId}' not found in areas`,
      };
    }

    // Check all exit targets exist
    const areaIds = new Set(world.areas.map(a => a.id));
    for (const area of world.areas) {
      for (const exit of area.exits) {
        if (!areaIds.has(exit.targetAreaId)) {
          return {
            valid: false,
            error: `Exit target '${exit.targetAreaId}' from '${area.id}' not found`,
          };
        }
      }
    }

    return { valid: true, error: '' };
  }

  /**
   * Generate pixel art for an area with full validation loop.
   *
   * Flow: generate → validate → repair if needed → visual validation → write file
   * Failures are logged but don't block - returns null on failure.
   *
   * @param gameId - Game ID for project file storage
   * @param context - Scene generation context
   * @param skipVisualValidation - Skip visual validation step
   * @returns PixelArtRef on success, null on failure
   */
  private async generateAreaPixelArt(
    gameId: string,
    context: SceneGenerationContext,
    skipVisualValidation: boolean
  ): Promise<PixelArtRef | null> {
    const areaId = context.areaId;
    console.log(`[WorldGenerator] Generating pixel art for area: ${areaId}`);

    // Step 1: Generate pixel art source using AI
    const sceneContext: Parameters<typeof this.pixelsrcAIGenerator.generateScene>[0] = {
      name: context.areaName,
      description: context.description,
      archetype: this.pixelsrcGenerator.generatePrompt(context).archetype,
    };
    // Only include optional properties if defined (exactOptionalPropertyTypes)
    if (context.timeOfDay !== undefined) {
      sceneContext.timeOfDay = context.timeOfDay;
    }
    if (context.weather !== undefined) {
      sceneContext.weather = context.weather;
    }
    const genResult = await this.pixelsrcAIGenerator.generateScene(sceneContext);

    if (!genResult.ok) {
      console.warn(
        `[WorldGenerator] Pixel art generation failed for ${areaId}: ${genResult.error.message}`
      );
      return null;
    }

    let source = genResult.value.source;
    console.log(`[WorldGenerator] Generated ${source.length} chars of pixel art source for ${areaId}`);

    // Step 2: Validate the generated source
    const validationResult = this.pixelsrcValidator.validate(source);

    if (!validationResult.valid) {
      console.log(
        `[WorldGenerator] Pixel art validation failed for ${areaId} with ${validationResult.errors.length} errors, attempting repair`
      );

      // Step 3: Repair if validation failed
      const repairResult = await this.pixelsrcRepairer.repair(source, validationResult, {
        description: context.description,
        archetype: this.pixelsrcGenerator.generatePrompt(context).archetype,
      });

      if (!repairResult.ok) {
        console.warn(
          `[WorldGenerator] Pixel art repair failed for ${areaId}: ${repairResult.error.message}`
        );
        return null;
      }

      if (!repairResult.value.success) {
        console.warn(
          `[WorldGenerator] Pixel art repair unsuccessful for ${areaId} after ${repairResult.value.attempts} attempts, ` +
            `${repairResult.value.remainingErrors.length} errors remain`
        );
        return null;
      }

      source = repairResult.value.source;
      console.log(`[WorldGenerator] Pixel art repaired for ${areaId} after ${repairResult.value.attempts} attempts`);
    }

    // Step 4: Visual validation (optional)
    if (!skipVisualValidation) {
      const visualResult = await this.pixelsrcVisualValidator.validate(source, {
        expectedContent: `${context.areaName}: ${context.description}`,
        contentType: 'scene',
        strictness: 'lenient',
      });

      if (!visualResult.ok) {
        console.warn(
          `[WorldGenerator] Visual validation failed for ${areaId}: ${visualResult.error.message}`
        );
        // Continue anyway - visual validation failure is soft
      } else if (!visualResult.value.approved) {
        console.warn(
          `[WorldGenerator] Visual validation not approved for ${areaId}: ${visualResult.value.feedback}`
        );
        // Continue anyway - let the art through with a warning
      } else {
        console.log(
          `[WorldGenerator] Visual validation passed for ${areaId}: ${visualResult.value.feedback}`
        );
      }
    }

    // Step 5: Write the file to the project
    const relativePath = `src/scenes/${areaId}.pxl`;
    try {
      await this.pixelsrcProjectManager.writeFile(gameId, relativePath, source);
      console.log(`[WorldGenerator] Wrote pixel art file for ${areaId}`);
    } catch (error) {
      console.warn(
        `[WorldGenerator] Failed to write pixel art file for ${areaId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return null;
    }

    // Step 6: Generate and return the PixelArtRef
    const pixelArtRef = this.pixelsrcGenerator.generateSceneRef(context);
    return pixelArtRef;
  }

  /**
   * Generate pixel art for all areas in a world.
   * Failures are logged but don't block - areas without successful generation
   * will still have their basic PixelArtRef set.
   *
   * @param areas - Areas to generate pixel art for
   * @param output - World generation output for area metadata
   * @param options - Generation options
   */
  private async generatePixelArtForAreas(
    areas: Area[],
    output: WorldGenerationOutput,
    options: WorldGenerationOptions
  ): Promise<void> {
    if (!options.enablePixelArtGeneration || !options.gameId) {
      return;
    }

    console.log(`[WorldGenerator] Starting pixel art generation for ${areas.length} areas`);

    // Initialize pixelsrc services
    await this.initializePixelsrc();

    // Initialize the project directory
    await this.pixelsrcProjectManager.initialize(options.gameId);

    // Generate pixel art for each area sequentially to avoid overwhelming AI
    for (const area of areas) {
      const areaOutput = output.areas.find((a) => a.id === area.id);
      if (!areaOutput) continue;

      const context: SceneGenerationContext = {
        areaId: areaOutput.id,
        areaName: areaOutput.name,
        description: areaOutput.description,
        tags: areaOutput.tags,
      };

      const pixelArtRef = await this.generateAreaPixelArt(
        options.gameId,
        context,
        options.skipVisualValidation ?? false
      );

      if (pixelArtRef) {
        area.pixelArtRef = pixelArtRef;
      }
      // If generation failed, area keeps its basic pixelArtRef from persistWorld
    }

    console.log(`[WorldGenerator] Pixel art generation complete`);
  }

  /**
   * Persist the generated world to the database
   */
  private persistWorld(output: WorldGenerationOutput): GeneratedWorld {
    const areas: Area[] = [];
    const allNpcs: NPC[] = [];

    // Create all areas first (without exits)
    for (const areaOutput of output.areas) {
      // Generate pixelArtRef for scene background
      const pixelArtRef = this.pixelsrcGenerator.generateSceneRef({
        areaId: areaOutput.id,
        areaName: areaOutput.name,
        description: areaOutput.description,
        tags: areaOutput.tags,
      });

      const area = this.areaRepo.create({
        id: areaOutput.id,
        name: areaOutput.name,
        description: areaOutput.description,
        tags: areaOutput.tags,
      });

      // Add pixelArtRef to the area (computed from area properties, not persisted)
      area.pixelArtRef = pixelArtRef;
      areas.push(area);
    }

    // Create exits, objects, and NPCs for each area
    for (const areaOutput of output.areas) {
      // Create exits
      for (const exitOutput of areaOutput.exits) {
        const exitInput: Parameters<typeof this.areaRepo.createExit>[0] = {
          areaId: areaOutput.id,
          direction: exitOutput.direction,
          targetAreaId: exitOutput.targetAreaId,
          description: exitOutput.description,
        };
        // Only include locked if explicitly defined
        if (exitOutput.locked !== undefined) {
          exitInput.locked = exitOutput.locked;
        }
        const exit = this.areaRepo.createExit(exitInput);
        // Add to the area's exits array
        const area = areas.find(a => a.id === areaOutput.id);
        if (area) {
          area.exits.push(exit);
        }
      }

      // Create objects
      for (const objOutput of areaOutput.objects) {
        const obj = this.areaRepo.createObject({
          id: objOutput.id,
          areaId: areaOutput.id,
          name: objOutput.name,
          description: objOutput.description,
          interactable: objOutput.interactable,
          tags: objOutput.tags,
        });
        // Add to the area's objects array
        const area = areas.find(a => a.id === areaOutput.id);
        if (area) {
          area.objects.push(obj);
        }
      }

      // Create NPCs
      for (const npcOutput of areaOutput.npcs) {
        const npc = this.areaRepo.createNPC({
          id: npcOutput.id,
          name: npcOutput.name,
          description: npcOutput.description,
          currentAreaId: areaOutput.id,
          disposition: npcOutput.disposition as NPCDisposition,
          tags: npcOutput.tags,
        });
        allNpcs.push(npc);
        // Add to the area's npcs array
        const area = areas.find(a => a.id === areaOutput.id);
        if (area) {
          area.npcs.push(npc);
        }
      }
    }

    return {
      worldName: output.worldName,
      worldDescription: output.worldDescription,
      startingAreaId: output.startingAreaId,
      areas,
      npcs: allNpcs,
      storyHooks: output.storyHooks ?? [],
    };
  }
}
