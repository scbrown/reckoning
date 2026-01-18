/**
 * Game Types
 *
 * Core domain types for game state, sessions, areas, characters, and NPCs.
 */

// =============================================================================
// Game State
// =============================================================================

/**
 * The persistent state of a single game instance
 */
export interface GameState {
  /** Unique identifier for this game */
  id: string;
  /** The player who owns this game */
  playerId: string;
  /** ID of the area the player is currently in */
  currentAreaId: string;
  /** Current turn number (increments with each action) */
  turn: number;
  /** When the game was created */
  createdAt: string;
  /** When the game was last updated */
  updatedAt: string;
  /** Path to game's pixelsrc project */
  pixelsrcProject?: string;
  /** Current act number (for art evolution) */
  act?: number;
}

/**
 * A complete game session with resolved references
 */
export interface GameSession {
  /** The underlying game state */
  state: GameState;
  /** The player character */
  player: Character;
  /** The currently loaded area */
  currentArea: Area;
  /** Recent events for context */
  recentEvents: string[];
}

// =============================================================================
// World Geography
// =============================================================================

/**
 * A location in the game world
 */
export interface Area {
  /** Unique identifier for this area */
  id: string;
  /** Display name of the area */
  name: string;
  /** Narrative description shown to the player */
  description: string;
  /** Available exits from this area */
  exits: AreaExit[];
  /** Interactable objects in this area */
  objects: AreaObject[];
  /** NPCs currently in this area */
  npcs: NPC[];
  /** Searchable tags for categorization */
  tags: string[];
  /** Reference to pixel art scene in game's pixelsrc project */
  pixelArtRef?: PixelArtRef;
}

/**
 * A connection from one area to another
 */
export interface AreaExit {
  /** Direction or description (e.g., "north", "through the door") */
  direction: string;
  /** ID of the destination area */
  targetAreaId: string;
  /** Description of the exit */
  description: string;
  /** Whether the exit is currently locked */
  locked?: boolean;
}

/**
 * An interactable object within an area
 */
export interface AreaObject {
  /** Unique identifier for this object */
  id: string;
  /** Display name of the object */
  name: string;
  /** Description when examined */
  description: string;
  /** Whether the player can interact with this object */
  interactable: boolean;
  /** Searchable tags for categorization */
  tags: string[];
}

// =============================================================================
// Characters
// =============================================================================

/**
 * A group of characters traveling together
 */
export interface Party {
  /** Unique identifier for this party */
  id: string;
  /** ID of the game this party belongs to */
  gameId: string;
  /** Characters in the party */
  members: Character[];
}

/**
 * A player character or party member
 */
export interface Character {
  /** Unique identifier for this character */
  id: string;
  /** Character's name */
  name: string;
  /** Character's appearance and personality description */
  description: string;
  /** Character's class or archetype */
  class: string;
  /** Character's current stats */
  stats: CharacterStats;
  /** ElevenLabs voice ID for TTS (optional) */
  voiceId?: string;
  /** Reference to pixel art in game's pixelsrc project */
  pixelArtRef?: PixelArtRef;
}

/**
 * Numeric statistics for a character
 */
export interface CharacterStats {
  /** Current health points */
  health: number;
  /** Maximum health points */
  maxHealth: number;
  /** Additional stats can be added as needed */
  [key: string]: number;
}

// =============================================================================
// NPCs
// =============================================================================

/**
 * A non-player character in the game world
 */
export interface NPC {
  /** Unique identifier for this NPC */
  id: string;
  /** NPC's name */
  name: string;
  /** NPC's appearance and personality description */
  description: string;
  /** ID of the area where this NPC currently is */
  currentAreaId: string;
  /** NPC's attitude toward the player */
  disposition: NPCDisposition;
  /** Searchable tags for categorization */
  tags: string[];
  /** Reference to pixel art in game's pixelsrc project */
  pixelArtRef?: PixelArtRef;
}

/**
 * An NPC's general attitude toward the player
 */
export type NPCDisposition =
  | 'hostile'
  | 'unfriendly'
  | 'neutral'
  | 'friendly'
  | 'allied';

// =============================================================================
// Pixelsrc Art Types
// =============================================================================

/**
 * Reference to pixelsrc art in the game's project directory
 */
export interface PixelArtRef {
  /** Relative path within the pixelsrc project (e.g., "characters/hero.pxl") */
  path: string;
  /** Primary sprite name for static display */
  spriteName: string;
  /** Animation metadata if this is an animated asset */
  animation?: PixelArtAnimation;
}

/**
 * Full pixelsrc art asset (used in API responses)
 */
export interface PixelArt {
  /** The .pxl source (JSONL format) - loaded from filesystem */
  source: string;
  /** Animation metadata if this is an animated asset */
  animation?: PixelArtAnimation;
}

/**
 * Animation metadata for client-side playback
 */
export interface PixelArtAnimation {
  /** Named animation states (e.g., 'idle', 'talking', 'emote') */
  states: Record<string, AnimationState>;
  /** Default state to play */
  defaultState: string;
}

/**
 * Configuration for a single animation state
 */
export interface AnimationState {
  /** Keyframe percentages to sprite/transform data */
  keyframes: Record<string, KeyframeData>;
  /** Duration in ms */
  duration: number;
  /** CSS timing function */
  timingFunction?: string;
  /** Whether to loop */
  loop?: boolean;
}

/**
 * Data for a single animation keyframe
 */
export interface KeyframeData {
  /** Sprite name to display at this keyframe */
  sprite?: string;
  /** CSS transform to apply */
  transform?: string;
  /** Opacity value (0-1) */
  opacity?: number;
}
