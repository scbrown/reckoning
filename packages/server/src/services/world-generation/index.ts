/**
 * World Generation Pipeline
 *
 * Generates initial world content (areas and NPCs) for a new game
 * using AI-powered content generation.
 */

import type { Character, Party } from '@reckoning/shared';
import { Result, Ok, Err } from '@reckoning/shared';
import { ClaudeCodeCLI } from '../ai/claude-cli.js';
import type { AIError, OutputSchema } from '../ai/types.js';
import {
  parseWorldGenerationOutput,
  type WorldGenerationOutput,
} from '../ai/schemas.js';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration options for WorldGenerator
 */
export interface WorldGeneratorConfig {
  /** AI provider timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Model to use for generation (default: 'sonnet' for quality) */
  model?: string;
}

interface RequiredConfig {
  timeout: number;
  model: string;
}

const DEFAULT_CONFIG: RequiredConfig = {
  timeout: 60000, // 60 seconds - world gen is complex
  model: 'sonnet', // Quality model for world generation
};

// =============================================================================
// JSON Schema for Claude CLI Output
// =============================================================================

/**
 * JSON Schema for world generation output
 *
 * This schema is passed to Claude CLI for structured output generation.
 */
const WORLD_GENERATION_SCHEMA: OutputSchema = {
  name: 'world_generation',
  schema: {
    type: 'object',
    properties: {
      worldName: {
        type: 'string',
        description: 'Name of the generated world or region',
      },
      worldDescription: {
        type: 'string',
        description: 'Brief description of the world theme and atmosphere',
      },
      startingAreaId: {
        type: 'string',
        description: 'ID of the area where the party starts',
      },
      areas: {
        type: 'array',
        minItems: 3,
        maxItems: 7,
        description: 'The areas in the generated world (3-7 areas)',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique identifier for this area',
            },
            name: {
              type: 'string',
              description: 'Display name of the area',
            },
            description: {
              type: 'string',
              description: 'Narrative description of the area (2-4 sentences)',
            },
            exits: {
              type: 'array',
              description: 'Connections to other areas',
              items: {
                type: 'object',
                properties: {
                  direction: {
                    type: 'string',
                    description: 'Direction or path name (e.g., "north", "through the door")',
                  },
                  targetAreaId: {
                    type: 'string',
                    description: 'ID of the destination area',
                  },
                  description: {
                    type: 'string',
                    description: 'Description of the exit',
                  },
                  locked: {
                    type: 'boolean',
                    description: 'Whether the exit is locked',
                  },
                },
                required: ['direction', 'targetAreaId', 'description'],
                additionalProperties: false,
              },
            },
            objects: {
              type: 'array',
              description: 'Interactable objects in this area',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Unique identifier for this object',
                  },
                  name: {
                    type: 'string',
                    description: 'Display name of the object',
                  },
                  description: {
                    type: 'string',
                    description: 'Description when examined',
                  },
                  interactable: {
                    type: 'boolean',
                    description: 'Whether the object can be interacted with',
                  },
                  tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags for categorization',
                  },
                },
                required: ['id', 'name', 'description', 'interactable', 'tags'],
                additionalProperties: false,
              },
            },
            npcs: {
              type: 'array',
              description: 'NPCs in this area',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Unique identifier for this NPC',
                  },
                  name: {
                    type: 'string',
                    description: "NPC's name",
                  },
                  description: {
                    type: 'string',
                    description: "NPC's appearance and personality",
                  },
                  currentAreaId: {
                    type: 'string',
                    description: 'ID of the area where this NPC is',
                  },
                  disposition: {
                    type: 'string',
                    enum: ['hostile', 'unfriendly', 'neutral', 'friendly', 'allied'],
                    description: "NPC's attitude toward the party",
                  },
                  tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags for categorization',
                  },
                },
                required: ['id', 'name', 'description', 'currentAreaId', 'disposition', 'tags'],
                additionalProperties: false,
              },
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for area categorization',
            },
          },
          required: ['id', 'name', 'description', 'exits', 'objects', 'npcs', 'tags'],
          additionalProperties: false,
        },
      },
    },
    required: ['worldName', 'worldDescription', 'startingAreaId', 'areas'],
    additionalProperties: false,
  },
};

// =============================================================================
// World Generation Error
// =============================================================================

/**
 * Error from world generation
 */
export interface WorldGenerationError {
  code: 'AI_ERROR' | 'PARSE_ERROR' | 'VALIDATION_ERROR';
  message: string;
  cause?: AIError;
}

// =============================================================================
// WorldGenerator Implementation
// =============================================================================

/**
 * Generates initial world content for a new game
 *
 * @example
 * ```typescript
 * const generator = new WorldGenerator();
 * const result = await generator.generate('game-123', party);
 * if (result.ok) {
 *   console.log(result.value.areas);
 * }
 * ```
 */
export class WorldGenerator {
  private config: RequiredConfig;
  private ai: ClaudeCodeCLI;

  constructor(config?: WorldGeneratorConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.ai = new ClaudeCodeCLI({
      timeout: this.config.timeout,
      model: this.config.model,
    });
  }

  /**
   * Generate initial world content for a game
   *
   * @param gameId - ID of the game to generate world for
   * @param party - The party of characters (used for theming)
   * @returns Generated world content or error
   */
  async generate(
    gameId: string,
    party: Character[] | Party
  ): Promise<Result<WorldGenerationOutput, WorldGenerationError>> {
    const members = Array.isArray(party) ? party : party.members;
    const prompt = this.buildPrompt(gameId, members);

    console.log(`[WorldGenerator] Generating world for game ${gameId} with ${members.length} party members`);

    // Execute AI generation
    const aiResult = await this.ai.execute({
      prompt,
      outputSchema: WORLD_GENERATION_SCHEMA,
    });

    if (!aiResult.ok) {
      console.error(`[WorldGenerator] AI generation failed: ${aiResult.error.message}`);
      return Err({
        code: 'AI_ERROR',
        message: `AI generation failed: ${aiResult.error.message}`,
        cause: aiResult.error,
      });
    }

    // Parse and validate output
    try {
      const parsed = parseWorldGenerationOutput(aiResult.value.content);
      console.log(`[WorldGenerator] Generated world "${parsed.worldName}" with ${parsed.areas.length} areas`);
      return Ok(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown parse error';
      console.error(`[WorldGenerator] Failed to parse output: ${message}`);
      return Err({
        code: 'PARSE_ERROR',
        message: `Failed to parse world generation output: ${message}`,
      });
    }
  }

  /**
   * Build the prompt for world generation
   */
  private buildPrompt(gameId: string, party: Character[]): string {
    const partyDescription = party
      .map((c) => `- ${c.name} (${c.class}): ${c.description}`)
      .join('\n');

    return `Generate an initial world for "The Reckoning" RPG game.

GAME ID: ${gameId}

PARTY MEMBERS:
${partyDescription}

REQUIREMENTS:
- Create 3-5 interconnected areas forming a coherent starting region
- Include 2-4 NPCs distributed across the areas
- Design the world to complement the party composition
- Make the starting area safe and welcoming
- Include at least one area with potential danger or mystery
- Create meaningful connections between areas (not just "north/south")
- Add 1-3 interactable objects per area

STYLE GUIDELINES:
- Dark fantasy atmosphere with moments of hope
- Rich sensory descriptions (sights, sounds, smells)
- NPCs with clear motivations and personalities
- Areas that suggest history and backstory
- Opportunities for both combat and roleplay

Generate a cohesive world that provides an engaging starting point for adventure.`;
  }
}
