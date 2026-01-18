/**
 * AI Output Schemas
 *
 * This file contains two types of schemas:
 * 1. JSON schemas for Claude CLI structured output (OutputSchema)
 * 2. Zod schemas for validation and parsing of AI-generated content
 */

import { z } from 'zod';
import type { OutputSchema } from './types.js';

// =============================================================================
// Claude CLI Output Schemas (JSON Schema format)
// =============================================================================

/**
 * Schema for generated game content
 *
 * The AI must respond with:
 * - eventType: Classification of the content
 * - content: The narrative text
 * - speaker: Character name if dialogue, null otherwise
 * - suggestedActions: Optional follow-up options
 * - evolutions: Optional evolution suggestions for entity traits/relationships
 */
export const GAME_CONTENT_SCHEMA: OutputSchema = {
  name: 'game_content',
  schema: {
    type: 'object',
    properties: {
      eventType: {
        type: 'string',
        enum: [
          'party_action',
          'party_dialogue',
          'npc_action',
          'npc_dialogue',
          'narration',
          'environment',
        ],
        description:
          'Classification of the generated content based on what it describes',
      },
      content: {
        type: 'string',
        description:
          'The narrative text to be read aloud or displayed to players',
      },
      speaker: {
        type: ['string', 'null'],
        description:
          'Name of the character speaking (for dialogue) or null for narration',
      },
      suggestedActions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of follow-up actions or prompts for the DM',
      },
      evolutions: {
        type: 'array',
        description: 'Suggested entity trait or relationship changes based on the narrative',
        items: {
          type: 'object',
          properties: {
            evolutionType: {
              type: 'string',
              enum: ['trait_add', 'trait_remove', 'relationship_change'],
              description: 'Type of evolution being suggested',
            },
            entityType: {
              type: 'string',
              enum: ['player', 'character', 'npc', 'location'],
              description: 'Type of entity being affected',
            },
            entityId: {
              type: 'string',
              description: 'ID of the entity being affected',
            },
            reason: {
              type: 'string',
              description: 'Explanation of why this evolution is suggested',
            },
            trait: {
              type: 'string',
              description: 'Trait name (for trait_add/trait_remove)',
            },
            targetType: {
              type: 'string',
              enum: ['player', 'character', 'npc', 'location'],
              description: 'Target entity type (for relationship_change)',
            },
            targetId: {
              type: 'string',
              description: 'Target entity ID (for relationship_change)',
            },
            dimension: {
              type: 'string',
              enum: ['trust', 'respect', 'affection', 'fear', 'resentment', 'debt'],
              description: 'Relationship dimension to change',
            },
            change: {
              type: 'number',
              description: 'Delta to apply to relationship dimension (-1.0 to 1.0)',
            },
          },
          required: ['evolutionType', 'entityType', 'entityId', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['eventType', 'content'],
    additionalProperties: false,
  },
};

/**
 * Schema for beat sequence generation
 *
 * The AI must respond with a sequence of 3-8 narrative beats,
 * each representing an atomic unit of narrative for TTS playback.
 */
export const BEAT_SEQUENCE_SCHEMA: OutputSchema = {
  name: 'beat_sequence',
  schema: {
    type: 'object',
    properties: {
      beats: {
        type: 'array',
        minItems: 3,
        maxItems: 8,
        description: 'A sequence of 3-8 narrative beats',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [
                'narration',
                'dialogue',
                'action',
                'thought',
                'sound',
                'transition',
              ],
              description: 'What kind of narrative element this is',
            },
            content: {
              type: 'string',
              description: 'The narrative content of this beat (1-3 sentences)',
            },
            speaker: {
              type: 'string',
              description:
                'Who is speaking/acting (required for dialogue, action, thought)',
            },
            emotion: {
              type: 'string',
              description: 'Emotional tone for TTS voice modulation',
            },
            volume: {
              type: 'string',
              enum: ['whisper', 'normal', 'loud'],
              description: 'Volume hint for TTS',
            },
            pace: {
              type: 'string',
              enum: ['slow', 'normal', 'fast'],
              description: 'Pacing hint for TTS',
            },
          },
          required: ['type', 'content'],
          additionalProperties: false,
        },
      },
    },
    required: ['beats'],
    additionalProperties: false,
  },
};

/**
 * Schema for world generation output
 *
 * The AI must respond with a complete world structure including:
 * - worldName: Name of the generated world
 * - worldDescription: Brief description of theme/atmosphere
 * - startingAreaId: ID of the area where players begin
 * - areas: Array of area definitions with exits, objects, and NPCs
 */
export const WORLD_GENERATION_SCHEMA: OutputSchema = {
  name: 'world_generation',
  schema: {
    type: 'object',
    properties: {
      worldName: {
        type: 'string',
        description: 'Name of the generated world or setting',
      },
      worldDescription: {
        type: 'string',
        description: 'Brief description of the world theme and atmosphere',
      },
      startingAreaId: {
        type: 'string',
        description: 'ID of the area where the party begins their adventure',
      },
      areas: {
        type: 'array',
        description: 'All areas in the generated world',
        minItems: 1,
        maxItems: 5,
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
              description: 'Narrative description shown to players',
            },
            exits: {
              type: 'array',
              description: 'Available exits from this area',
              items: {
                type: 'object',
                properties: {
                  direction: {
                    type: 'string',
                    description: 'Direction or description (e.g., "north", "through the door")',
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
                    description: 'Whether the exit is currently locked',
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
                    description: 'Whether the player can interact with this object',
                  },
                  tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Searchable tags for categorization',
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
                  disposition: {
                    type: 'string',
                    enum: ['hostile', 'unfriendly', 'neutral', 'friendly', 'allied'],
                    description: "NPC's attitude toward the party",
                  },
                  tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Searchable tags for categorization',
                  },
                },
                required: ['id', 'name', 'description', 'disposition', 'tags'],
                additionalProperties: false,
              },
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Searchable tags for categorization',
            },
          },
          required: ['id', 'name', 'description', 'exits', 'objects', 'npcs', 'tags'],
          additionalProperties: false,
        },
      },
      storyHooks: {
        type: 'array',
        description: 'Optional story hooks for the DM to use',
        items: { type: 'string' },
      },
    },
    required: ['worldName', 'worldDescription', 'startingAreaId', 'areas'],
    additionalProperties: false,
  },
};

// =============================================================================
// Zod Schemas for World Generation
// =============================================================================

/**
 * Schema for an interactable object within an area
 */
export const AreaObjectSchema = z.object({
  /** Unique identifier for this object */
  id: z.string().min(1),
  /** Display name of the object */
  name: z.string().min(1),
  /** Description when examined */
  description: z.string().min(1),
  /** Whether the player can interact with this object */
  interactable: z.boolean(),
  /** Searchable tags for categorization */
  tags: z.array(z.string()),
});

/**
 * Schema for a connection from one area to another
 */
export const AreaExitSchema = z.object({
  /** Direction or description (e.g., "north", "through the door") */
  direction: z.string().min(1),
  /** ID of the destination area */
  targetAreaId: z.string().min(1),
  /** Description of the exit */
  description: z.string().min(1),
  /** Whether the exit is currently locked */
  locked: z.boolean().optional(),
});

/**
 * Schema for NPC disposition
 */
export const NPCDispositionSchema = z.enum([
  'hostile',
  'unfriendly',
  'neutral',
  'friendly',
  'allied',
]);

/**
 * Schema for a non-player character
 */
export const NPCSchema = z.object({
  /** Unique identifier for this NPC */
  id: z.string().min(1),
  /** NPC's name */
  name: z.string().min(1),
  /** NPC's appearance and personality description */
  description: z.string().min(1),
  /** ID of the area where this NPC currently is */
  currentAreaId: z.string().min(1),
  /** NPC's attitude toward the player */
  disposition: NPCDispositionSchema,
  /** Searchable tags for categorization */
  tags: z.array(z.string()),
});

/**
 * Schema for an area in the world
 */
export const AreaSchema = z.object({
  /** Unique identifier for this area */
  id: z.string().min(1),
  /** Display name of the area */
  name: z.string().min(1),
  /** Narrative description shown to the player */
  description: z.string().min(1),
  /** Available exits from this area */
  exits: z.array(AreaExitSchema),
  /** Interactable objects in this area */
  objects: z.array(AreaObjectSchema),
  /** NPCs currently in this area */
  npcs: z.array(NPCSchema),
  /** Searchable tags for categorization */
  tags: z.array(z.string()),
});

/**
 * Schema for the complete world generation output
 *
 * This defines the structure of AI-generated world content,
 * including all areas, NPCs, and world metadata.
 */
export const WorldGenerationOutputSchema = z.object({
  /** Name of the generated world */
  worldName: z.string().min(1),
  /** Brief description of the world theme and atmosphere */
  worldDescription: z.string().min(1),
  /** ID of the area where the player starts */
  startingAreaId: z.string().min(1),
  /** All areas in the generated world */
  areas: z.array(AreaSchema).min(1),
  /** Optional story hooks for the DM */
  storyHooks: z.array(z.string()).optional(),
});

// =============================================================================
// Zod Schemas for Beat Sequence Validation
// =============================================================================

/**
 * Schema for beat type
 */
export const BeatTypeSchema = z.enum([
  'narration',
  'dialogue',
  'action',
  'thought',
  'sound',
  'transition',
]);

/**
 * Schema for beat volume hint
 */
export const BeatVolumeSchema = z.enum(['whisper', 'normal', 'loud']);

/**
 * Schema for beat pace hint
 */
export const BeatPaceSchema = z.enum(['slow', 'normal', 'fast']);

/**
 * Schema for beat metadata from AI response
 */
export const BeatMetadataSchema = z.object({
  /** Emotional tone for TTS voice modulation */
  emotion: z.string().optional(),
  /** Volume hint for TTS */
  volume: BeatVolumeSchema.optional(),
  /** Pacing hint for TTS */
  pace: BeatPaceSchema.optional(),
  /** Pause duration after this beat (in milliseconds) */
  pauseAfter: z.number().optional(),
});

/**
 * Schema for a single narrative beat from AI response
 */
export const AIBeatSchema = z.object({
  /** What kind of narrative element this is */
  type: BeatTypeSchema,
  /** The narrative content of this beat */
  content: z.string().min(1),
  /** Who is speaking/acting (for dialogue, action, thought) */
  speaker: z.string().optional(),
  /** Emotional tone for TTS */
  emotion: z.string().optional(),
  /** Volume hint for TTS */
  volume: BeatVolumeSchema.optional(),
  /** Pacing hint for TTS */
  pace: BeatPaceSchema.optional(),
});

/**
 * Schema for beat sequence output from AI
 */
export const BeatSequenceOutputSchema = z.object({
  /** The sequence of narrative beats */
  beats: z.array(AIBeatSchema).min(3).max(8),
});

// =============================================================================
// Zod Schemas for Evolution Suggestion Validation
// =============================================================================

/**
 * Schema for evolution type
 */
export const EvolutionTypeSchema = z.enum([
  'trait_add',
  'trait_remove',
  'relationship_change',
]);

/**
 * Schema for entity type in evolutions
 */
export const EntityTypeSchema = z.enum([
  'player',
  'character',
  'npc',
  'location',
]);

/**
 * Schema for relationship dimension
 */
export const RelationshipDimensionSchema = z.enum([
  'trust',
  'respect',
  'affection',
  'fear',
  'resentment',
  'debt',
]);

/**
 * Schema for a single evolution suggestion from AI response
 */
export const EvolutionSuggestionSchema = z.object({
  /** Type of evolution being suggested */
  evolutionType: EvolutionTypeSchema,
  /** Type of entity being affected */
  entityType: EntityTypeSchema,
  /** ID of the entity being affected */
  entityId: z.string().min(1),
  /** Explanation of why this evolution is suggested */
  reason: z.string().min(1),
  /** Trait name (for trait_add/trait_remove) */
  trait: z.string().optional(),
  /** Target entity type (for relationship_change) */
  targetType: EntityTypeSchema.optional(),
  /** Target entity ID (for relationship_change) */
  targetId: z.string().optional(),
  /** Relationship dimension to change */
  dimension: RelationshipDimensionSchema.optional(),
  /** Delta to apply to relationship dimension (-1.0 to 1.0) */
  change: z.number().min(-1).max(1).optional(),
});

/**
 * Schema for game content output with optional evolutions
 */
export const GameContentOutputSchema = z.object({
  /** Classification of the content */
  eventType: z.string(),
  /** The narrative text */
  content: z.string().min(1),
  /** Speaker name or null */
  speaker: z.string().nullable().optional(),
  /** Suggested follow-up actions */
  suggestedActions: z.array(z.string()).optional(),
  /** Evolution suggestions */
  evolutions: z.array(EvolutionSuggestionSchema).optional(),
});

// =============================================================================
// Type Exports
// =============================================================================

/** Inferred type for area objects */
export type AreaObjectOutput = z.infer<typeof AreaObjectSchema>;

/** Inferred type for area exits */
export type AreaExitOutput = z.infer<typeof AreaExitSchema>;

/** Inferred type for NPC disposition */
export type NPCDispositionOutput = z.infer<typeof NPCDispositionSchema>;

/** Inferred type for NPCs */
export type NPCOutput = z.infer<typeof NPCSchema>;

/** Inferred type for areas */
export type AreaOutput = z.infer<typeof AreaSchema>;

/** Inferred type for world generation output */
export type WorldGenerationOutput = z.infer<typeof WorldGenerationOutputSchema>;

/** Inferred type for beat type */
export type BeatTypeOutput = z.infer<typeof BeatTypeSchema>;

/** Inferred type for beat metadata */
export type BeatMetadataOutput = z.infer<typeof BeatMetadataSchema>;

/** Inferred type for a single AI beat */
export type AIBeatOutput = z.infer<typeof AIBeatSchema>;

/** Inferred type for beat sequence output */
export type BeatSequenceOutput = z.infer<typeof BeatSequenceOutputSchema>;

/** Inferred type for evolution type */
export type EvolutionTypeOutput = z.infer<typeof EvolutionTypeSchema>;

/** Inferred type for entity type */
export type EntityTypeOutput = z.infer<typeof EntityTypeSchema>;

/** Inferred type for relationship dimension */
export type RelationshipDimensionOutput = z.infer<typeof RelationshipDimensionSchema>;

/** Inferred type for a single evolution suggestion */
export type EvolutionSuggestionOutput = z.infer<typeof EvolutionSuggestionSchema>;

/** Inferred type for game content output with evolutions */
export type GameContentOutput = z.infer<typeof GameContentOutputSchema>;

// =============================================================================
// Parsing Utilities
// =============================================================================

/**
 * Parse and validate world generation output from AI response
 *
 * @param input - Raw input to parse (string or object)
 * @returns Parsed and validated WorldGenerationOutput
 * @throws ZodError if validation fails
 */
export function parseWorldGenerationOutput(
  input: unknown
): WorldGenerationOutput {
  // If input is a string, try to parse as JSON
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  return WorldGenerationOutputSchema.parse(data);
}

/**
 * Safely parse world generation output, returning null on failure
 *
 * @param input - Raw input to parse (string or object)
 * @returns Parsed WorldGenerationOutput or null if invalid
 */
export function safeParseWorldGenerationOutput(
  input: unknown
): WorldGenerationOutput | null {
  try {
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    const result = WorldGenerationOutputSchema.safeParse(data);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Parse and validate beat sequence output from AI response
 *
 * @param input - Raw input to parse (string or object)
 * @returns Parsed and validated BeatSequenceOutput
 * @throws ZodError if validation fails
 */
export function parseBeatSequenceOutput(input: unknown): BeatSequenceOutput {
  // If input is a string, try to parse as JSON
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  return BeatSequenceOutputSchema.parse(data);
}

/**
 * Safely parse beat sequence output, returning null on failure
 *
 * @param input - Raw input to parse (string or object)
 * @returns Parsed BeatSequenceOutput or null if invalid
 */
export function safeParseBeatSequenceOutput(
  input: unknown
): BeatSequenceOutput | null {
  try {
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    const result = BeatSequenceOutputSchema.safeParse(data);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Safely parse game content output including evolutions
 *
 * @param input - Raw input to parse (string or object)
 * @returns Parsed GameContentOutput or null if invalid
 */
export function safeParseGameContentOutput(
  input: unknown
): GameContentOutput | null {
  try {
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    const result = GameContentOutputSchema.safeParse(data);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Extract evolution suggestions from parsed game content
 *
 * @param input - Raw parsed object that may contain evolutions
 * @returns Array of validated evolution suggestions, empty if none
 */
export function extractEvolutionSuggestions(
  input: unknown
): EvolutionSuggestionOutput[] {
  if (!input || typeof input !== 'object') {
    return [];
  }

  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.evolutions)) {
    return [];
  }

  const validEvolutions: EvolutionSuggestionOutput[] = [];
  for (const item of obj.evolutions) {
    const result = EvolutionSuggestionSchema.safeParse(item);
    if (result.success) {
      validEvolutions.push(result.data);
    }
  }

  return validEvolutions;
}
