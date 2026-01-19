/**
 * Export Service Types
 *
 * Type definitions for the TOML/JSON export functionality.
 * Based on the export format specification (EXPT-001).
 */

/**
 * Export format version
 */
export const EXPORT_VERSION = '1.0.0';

/**
 * Export format types
 */
export type ExportFormat = 'toml' | 'json' | 'jsonl';

/**
 * Options for TOML export
 */
export interface TomlExportOptions {
  /** Directory to write the export to */
  outputPath: string;
  /** Game ID to export */
  gameId: string;
  /** Optional custom export name (defaults to game name) */
  exportName?: string;
  /** Include event log in export (default: true) */
  includeEvents?: boolean;
  /** Maximum number of events to include (default: unlimited) */
  eventLimit?: number;
}

/**
 * Result of an export operation
 */
export interface ExportResult {
  /** Path to the exported directory/file */
  path: string;
  /** Number of files created */
  fileCount: number;
  /** Export format used */
  format: ExportFormat;
  /** Export version */
  version: string;
  /** Timestamp of export */
  exportedAt: string;
  /** Game ID that was exported */
  gameId: string;
  /** Game name */
  gameName: string;
}

/**
 * Export metadata for manifest.toml
 */
export interface ExportManifest {
  export: {
    version: string;
    format: string;
    exported_at: string;
    game_id: string;
    game_name: string;
  };
  source: {
    reckoning_version: string;
    platform: string;
  };
  checksum?: {
    algorithm: string;
    value: string;
  };
}

/**
 * Game state for game.toml
 */
export interface GameExport {
  game: {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
  };
  state: {
    turn: number;
    current_area_id: string;
    current_scene_id?: string;
  };
  player: {
    id: string;
    character_ref: string;
  };
  party: {
    id: string;
    member_refs: string[];
  };
  pixelsrc?: {
    project?: string;
    act?: number;
  };
}

/**
 * Character export format
 */
export interface CharacterExport {
  character: {
    id: string;
    name: string;
    description: string;
    class?: string;
  };
  stats: {
    health: number;
    max_health: number;
    strength?: number;
    dexterity?: number;
    wisdom?: number;
  };
  voice?: {
    voice_id: string;
  };
  pixel_art?: {
    path?: string;
    sprite?: string;
    animation_state?: string;
  };
}

/**
 * NPC export format
 */
export interface NpcExport {
  npc: {
    id: string;
    name: string;
    description: string;
    current_area_id: string;
    disposition: string;
    tags: string[];
  };
  pixel_art?: {
    path?: string;
    sprite?: string;
  };
}

/**
 * Location/Area export format
 */
export interface LocationExport {
  area: {
    id: string;
    name: string;
    description: string;
    tags: string[];
  };
  exits: Array<{
    direction: string;
    target_area_id: string;
    description: string;
    locked: boolean;
  }>;
  objects: Array<{
    id: string;
    name: string;
    description: string;
    interactable: boolean;
    tags: string[];
  }>;
  pixel_art?: {
    path?: string;
    sprite?: string;
  };
}

/**
 * Scene export format
 */
export interface SceneExport {
  scene: {
    id: string;
    name: string;
    description: string;
    scene_type: string;
    location_id?: string;
    status: string;
  };
  timing: {
    started_turn: number;
    completed_turn?: number;
  };
  atmosphere: {
    mood?: string;
    stakes?: string;
  };
  metadata: {
    created_at: string;
    updated_at: string;
  };
}

/**
 * Scene index export format
 */
export interface SceneIndexExport {
  scenes: {
    current_scene_id?: string;
    count: number;
    list: Array<{
      id: string;
      name: string;
      status: string;
      file: string;
    }>;
  };
}

/**
 * Scene connections export format
 */
export interface SceneConnectionsExport {
  connections: Array<{
    id: string;
    from_scene_id: string;
    to_scene_id: string;
    connection_type: string;
    description?: string;
    requirements?: {
      flags?: string[];
      traits?: string[];
      relationships?: Array<{
        entity_type: string;
        entity_id: string;
        dimension: string;
        min_value?: number;
        max_value?: number;
      }>;
    };
  }>;
}

/**
 * Trait catalog export format
 */
export interface TraitCatalogExport {
  catalog: {
    version: string;
  };
  traits: Array<{
    trait: string;
    category: string;
    description: string;
  }>;
}

/**
 * Entity traits export format
 */
export interface EntityTraitsExport {
  entity_traits: Array<{
    id: string;
    entity_type: string;
    entity_id: string;
    trait: string;
    acquired_turn: number;
    source_event_id?: string;
    status: string;
  }>;
}

/**
 * Relationships export format
 */
export interface RelationshipsExport {
  relationships: Array<{
    id: string;
    from_type: string;
    from_id: string;
    to_type: string;
    to_id: string;
    updated_turn: number;
    dimensions: {
      trust: number;
      respect: number;
      affection: number;
      fear: number;
      resentment: number;
      debt: number;
    };
  }>;
}

/**
 * Flags export format
 */
export interface FlagsExport {
  flags: Record<string, boolean | string>;
}

/**
 * JSONL event format (for events.jsonl)
 */
export interface JsonlEvent {
  id: string;
  game_id: string;
  turn: number;
  timestamp: string;
  event_type: string;
  content: string;
  original_generated?: string;
  speaker?: string;
  location_id: string;
  witnesses: string[];
  action?: string;
  actor_type?: string;
  actor_id?: string;
  target_type?: string;
  target_id?: string;
  tags?: string[];
}
