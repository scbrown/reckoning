import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

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
 * WorldSeed data structure
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

/**
 * Database row type
 */
interface WorldSeedRow {
  id: string;
  game_id: string;
  dm_prompt: string;
  seed_data: string; // JSON string
  research_log: string | null;
  created_at: string;
}

/**
 * Repository for world seed CRUD operations
 */
export class WorldSeedRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create a new world seed
   */
  create(input: CreateWorldSeedInput): WorldSeedRecord {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
      INSERT INTO world_seeds (id, game_id, dm_prompt, seed_data, research_log, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        input.gameId,
        input.dmPrompt,
        JSON.stringify(input.seedData),
        input.researchLog || null,
        now
      );

    return {
      id,
      gameId: input.gameId,
      dmPrompt: input.dmPrompt,
      createdAt: now,
      sourceInspiration: input.seedData.sourceInspiration,
    };
  }

  /**
   * Find a world seed by ID
   */
  findById(id: string): WorldSeedFull | null {
    const row = this.db
      .prepare(
        `
      SELECT id, game_id, dm_prompt, seed_data, research_log, created_at
      FROM world_seeds WHERE id = ?
    `
      )
      .get(id) as WorldSeedRow | undefined;

    if (!row) return null;

    return this.rowToFull(row);
  }

  /**
   * Find all world seeds for a game (metadata only)
   */
  findByGame(gameId: string): WorldSeedRecord[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, game_id, dm_prompt, seed_data, created_at
      FROM world_seeds WHERE game_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(gameId) as WorldSeedRow[];

    return rows.map((row) => this.rowToRecord(row));
  }

  /**
   * Find the most recent world seed for a game
   */
  findLatestByGame(gameId: string): WorldSeedFull | null {
    const row = this.db
      .prepare(
        `
      SELECT id, game_id, dm_prompt, seed_data, research_log, created_at
      FROM world_seeds WHERE game_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `
      )
      .get(gameId) as WorldSeedRow | undefined;

    if (!row) return null;

    return this.rowToFull(row);
  }

  /**
   * Delete a world seed
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM world_seeds WHERE id = ?').run(id);
  }

  /**
   * Delete all world seeds for a game
   */
  deleteByGame(gameId: string): void {
    this.db.prepare('DELETE FROM world_seeds WHERE game_id = ?').run(gameId);
  }

  /**
   * Count world seeds for a game
   */
  countByGame(gameId: string): number {
    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM world_seeds WHERE game_id = ?')
      .get(gameId) as { count: number };
    return result.count;
  }

  private rowToRecord(row: WorldSeedRow): WorldSeedRecord {
    const seedData = JSON.parse(row.seed_data) as WorldSeed;
    return {
      id: row.id,
      gameId: row.game_id,
      dmPrompt: row.dm_prompt,
      createdAt: row.created_at,
      sourceInspiration: seedData.sourceInspiration,
    };
  }

  private rowToFull(row: WorldSeedRow): WorldSeedFull {
    const seedData = JSON.parse(row.seed_data) as WorldSeed;
    const result: WorldSeedFull = {
      id: row.id,
      gameId: row.game_id,
      dmPrompt: row.dm_prompt,
      createdAt: row.created_at,
      sourceInspiration: seedData.sourceInspiration,
      seedData,
    };

    if (row.research_log !== null) {
      result.researchLog = row.research_log;
    }

    return result;
  }
}
