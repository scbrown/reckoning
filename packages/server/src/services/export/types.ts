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
 * JSON export format version and name (for JSON exporter)
 */
export const EXPORT_FORMAT_VERSION = '1.0.0';
export const EXPORT_FORMAT_NAME = 'reckoning-json';

/**
 * Export format types
 */
export type ExportFormat = 'toml' | 'json' | 'jsonl';

// =============================================================================
// Git Integration Types
// =============================================================================

/**
 * Git remote provider type
 */
export type GitProvider = 'github' | 'gitlab' | 'custom';

/**
 * OAuth configuration for Git providers
 */
export interface GitOAuthConfig {
  /** OAuth provider */
  provider: GitProvider;
  /** Client ID for OAuth */
  clientId?: string;
  /** OAuth access token (if already authenticated) */
  accessToken?: string;
  /** OAuth refresh token */
  refreshToken?: string;
  /** Token expiry timestamp */
  tokenExpiry?: string;
}

/**
 * Git remote configuration
 */
export interface GitRemoteConfig {
  /** Remote name (default: 'origin') */
  name?: string;
  /** Remote URL (e.g., https://github.com/user/repo.git) */
  url: string;
  /** OAuth config for authentication */
  oauth?: GitOAuthConfig;
}

/**
 * Options for Git integration
 */
export interface GitIntegrationOptions {
  /** Path to the export directory */
  exportPath: string;
  /** Whether to commit changes (default: true) */
  commit?: boolean;
  /** Commit message (required if commit is true) */
  commitMessage?: string;
  /** Whether to push to remote (default: false) */
  push?: boolean;
  /** Remote configuration (required if push is true) */
  remote?: GitRemoteConfig;
  /** Author name for commits */
  authorName?: string;
  /** Author email for commits */
  authorEmail?: string;
  /** Create initial commit if repo is new (default: true) */
  initialCommit?: boolean;
}

/**
 * Result of Git integration operation
 */
export interface GitIntegrationResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Path to the git repository */
  repoPath: string;
  /** Whether the repo was newly initialized */
  initialized: boolean;
  /** Commit hash (if a commit was made) */
  commitHash?: string;
  /** Commit message (if a commit was made) */
  commitMessage?: string;
  /** Whether changes were pushed to remote */
  pushed: boolean;
  /** Remote URL (if pushed) */
  remoteUrl?: string;
  /** Error message (if operation failed) */
  error?: string;
  /** Files changed in the commit */
  filesChanged?: number;
}

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

// =============================================================================
// JSON Export Types
// =============================================================================

/**
 * Options for JSON export
 */
export interface JsonExportOptions {
  /** Include event history (default: true) */
  includeEvents?: boolean;
  /** Maximum events to include (default: null = all) */
  eventLimit?: number | null;
  /** Include pending evolutions (default: true) */
  includePending?: boolean;
  /** Include emergence notifications (default: true) */
  includeNotifications?: boolean;
  /** gzip compress output (default: false) */
  compressed?: boolean;
}

/**
 * JSON export metadata
 */
export interface JsonExportMetadata {
  version: string;
  format: string;
  exportedAt: string;
  gameId: string;
  source: {
    reckoningVersion: string;
    platform: string;
  };
  options: {
    includeEvents: boolean;
    eventLimit: number | null;
    compressed: boolean;
  };
}

/**
 * Exported game data
 */
export interface ExportedGame {
  id: string;
  createdAt: string;
  updatedAt: string;
  turn: number;
  currentAreaId: string;
  currentSceneId: string | null;
  pixelsrcProject: string | null;
  act: number | null;
}

/**
 * Exported character data
 */
export interface ExportedCharacter {
  id: string;
  name: string;
  description: string;
  class: string;
  stats: {
    health: number;
    maxHealth: number;
    [key: string]: number;
  };
  voiceId: string | null;
  pixelArtRef: {
    path: string;
    spriteName?: string;
    animation?: string;
  } | null;
}

/**
 * Exported party data
 */
export interface ExportedParty {
  id: string;
  members: ExportedCharacter[];
}

/**
 * Exported NPC data
 */
export interface ExportedNPC {
  id: string;
  name: string;
  description: string;
  currentAreaId: string;
  disposition: string;
  tags: string[];
  pixelArtRef: {
    path: string;
    spriteName?: string;
  } | null;
}

/**
 * Exported area exit
 */
export interface ExportedAreaExit {
  direction: string;
  targetAreaId: string;
  description: string;
  locked: boolean;
}

/**
 * Exported area object
 */
export interface ExportedAreaObject {
  id: string;
  name: string;
  description: string;
  interactable: boolean;
  tags: string[];
}

/**
 * Exported area data
 */
export interface ExportedArea {
  id: string;
  name: string;
  description: string;
  tags: string[];
  exits: ExportedAreaExit[];
  objects: ExportedAreaObject[];
  pixelArtRef: {
    path: string;
    spriteName?: string;
  } | null;
}

/**
 * Exported scene data
 */
export interface ExportedScene {
  id: string;
  gameId: string;
  name: string;
  description: string;
  sceneType: string;
  locationId: string | null;
  startedTurn: number;
  completedTurn: number | null;
  status: string;
  mood: string | null;
  stakes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Exported scene connection
 */
export interface ExportedSceneConnection {
  id: string;
  gameId: string;
  fromSceneId: string;
  toSceneId: string;
  connectionType: string;
  description: string | null;
  requirements: unknown | null;
  createdAt: string;
}

/**
 * Exported scene availability
 */
export interface ExportedSceneAvailability {
  sceneId: string;
  unlockedTurn: number;
  unlockedBy: string | null;
}

/**
 * Exported scenes collection
 */
export interface ExportedScenes {
  currentSceneId: string | null;
  list: ExportedScene[];
  connections: ExportedSceneConnection[];
  availability: ExportedSceneAvailability[];
}

/**
 * Exported trait catalog entry
 */
export interface ExportedTraitCatalogEntry {
  trait: string;
  category: string;
  description: string;
}

/**
 * Exported entity trait
 */
export interface ExportedEntityTrait {
  id: string;
  gameId: string;
  entityType: string;
  entityId: string;
  trait: string;
  acquiredTurn: number;
  sourceEventId: string | null;
  status: string;
  createdAt: string;
}

/**
 * Exported traits collection
 */
export interface ExportedTraits {
  catalog: ExportedTraitCatalogEntry[];
  entities: ExportedEntityTrait[];
}

/**
 * Exported relationship
 */
export interface ExportedRelationship {
  id: string;
  gameId: string;
  from: {
    type: string;
    id: string;
  };
  to: {
    type: string;
    id: string;
  };
  trust: number;
  respect: number;
  affection: number;
  fear: number;
  resentment: number;
  debt: number;
  updatedTurn: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Exported event
 */
export interface ExportedEvent {
  id: string;
  gameId: string;
  turn: number;
  timestamp: string;
  eventType: string;
  content: string;
  originalGenerated: string | null;
  speaker: string | null;
  locationId: string;
  witnesses: string[];
  action: string | null;
  actorType: string | null;
  actorId: string | null;
  targetType: string | null;
  targetId: string | null;
  tags: string[];
}

/**
 * Exported pending evolution
 */
export interface ExportedPendingEvolution {
  id: string;
  gameId: string;
  turn: number;
  evolutionType: string;
  entityType: string;
  entityId: string;
  trait: string | null;
  targetType: string | null;
  targetId: string | null;
  dimension: string | null;
  oldValue: number | null;
  newValue: number | null;
  reason: string;
  sourceEventId: string | null;
  status: string;
  dmNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/**
 * Exported emergence notification
 */
export interface ExportedEmergenceNotification {
  id: string;
  gameId: string;
  emergenceType: string;
  entityType: string;
  entityId: string;
  confidence: number;
  reason: string;
  triggeringEventId: string;
  contributingFactors: unknown;
  status: string;
  dmNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/**
 * Exported flags
 */
export interface ExportedFlags {
  [key: string]: boolean | string | number;
}

/**
 * Complete JSON export structure
 */
export interface JsonExport {
  export: JsonExportMetadata;
  game: ExportedGame;
  player: ExportedCharacter | null;
  party: ExportedParty | null;
  npcs: ExportedNPC[];
  areas: ExportedArea[];
  scenes: ExportedScenes;
  traits: ExportedTraits;
  relationships: ExportedRelationship[];
  flags: ExportedFlags;
  events?: ExportedEvent[];
  pendingEvolutions?: ExportedPendingEvolution[];
  emergenceNotifications?: ExportedEmergenceNotification[];
}

/**
 * Result of JSON export operation
 */
export interface JsonExportResult {
  data: string | Buffer;
  compressed: boolean;
  contentType: string;
  filename: string;
}
