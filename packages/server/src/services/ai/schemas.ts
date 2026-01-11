/**
 * AI Output Schemas
 *
 * Zod schemas for validating and parsing AI-generated content.
 * These schemas define the expected structure of AI outputs for world generation.
 */

import { z } from 'zod';

// =============================================================================
// Area Component Schemas
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

// =============================================================================
// World Generation Schema
// =============================================================================

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
