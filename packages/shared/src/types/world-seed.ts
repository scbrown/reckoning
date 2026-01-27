/**
 * WorldSeed types - the output format for world seeding research.
 *
 * These types define the structure Claude Code produces when researching
 * source material and adapting it into a game-ready world seed.
 */

/**
 * Tone options for world seeds
 */
export type WorldSeedTone =
  | 'dark'
  | 'light'
  | 'comedic'
  | 'dramatic'
  | 'horror'
  | 'adventure';

/**
 * Character role options
 */
export type CharacterRole = 'player' | 'ally' | 'villain' | 'neutral';

/**
 * Palette preset options for mood-based palette shifts
 */
export type PalettePreset =
  | 'warm_heroic'
  | 'cool_villain'
  | 'gritty_worn'
  | 'festive'
  | 'noir'
  | 'horror';

/**
 * Palette shift configuration for sprites
 */
export interface PaletteShift {
  preset?: PalettePreset;
  hueShift?: number;
  saturation?: number;
  brightness?: number;
}

/**
 * Character casting - maps a character to a sprite asset
 */
export interface CharacterCasting {
  /** Character name from the WorldSeed */
  name: string;
  /** Archetype sprite ID from manifest */
  spriteId: string;
  /** Palette shift to apply */
  palette?: PaletteShift;
  /** AI reasoning for this casting choice */
  reasoning?: string;
}

/**
 * Location mapping - maps a location to a background asset
 */
export interface LocationMapping {
  /** Location name from the WorldSeed */
  name: string;
  /** Background asset ID */
  background: string;
  /** Lighting mood override */
  lighting?: string;
  /** AI reasoning for this mapping choice */
  reasoning?: string;
}

/**
 * Asset mappings for world seed - maps characters and locations to sprites
 */
export interface AssetMappings {
  characters: CharacterCasting[];
  locations: LocationMapping[];
  globalPalette: PalettePreset;
}

/**
 * WorldSeed data structure - the core output of the research agent.
 */
export interface WorldSeed {
  $schema: 'worldseed-v1';
  sourceInspiration: string;
  setting: string;
  tone: {
    overall: WorldSeedTone;
    description: string;
  };
  characters: Array<{
    name: string;
    role: CharacterRole;
    description: string;
    suggestedTraits: string[];
    visualDescription: string;
  }>;
  locations: Array<{
    name: string;
    description: string;
    mood: string;
    connectedTo: string[];
    visualDescription: string;
  }>;
  themes: string[];
  visualStyle: {
    era: string;
    aesthetic: string;
    colorPalette: string[];
    lightingMood: string;
  };
  contextSummary: string;
  assetMappings?: AssetMappings;
}

/**
 * Metadata-only view of a world seed (without full seed_data)
 */
export interface WorldSeedRecord {
  id: string;
  gameId: string;
  dmPrompt: string;
  createdAt: string;
  sourceInspiration: string;
}

/**
 * Full world seed with all data
 */
export interface WorldSeedFull extends WorldSeedRecord {
  seedData: WorldSeed;
  researchLog?: string;
}

/**
 * Input for creating a new world seed
 */
export interface CreateWorldSeedInput {
  gameId: string;
  dmPrompt: string;
  seedData: WorldSeed;
  researchLog?: string;
}
