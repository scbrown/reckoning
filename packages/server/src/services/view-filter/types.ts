/**
 * View Filter Types
 *
 * Types for the game state filtering layer that supports multi-view UI.
 */

import type { GameState, Character, Area, NPC, Party } from '@reckoning/shared';
import type { Relationship, EntityTrait } from '../../db/repositories/index.js';
import type { PerceivedRelationship } from '../../db/repositories/perceived-relationship-repository.js';
import type { Scene } from '../../db/repositories/scene-repository.js';
import type { PendingEvolution } from '../../db/repositories/pending-evolution-repository.js';

/**
 * View types for filtering
 */
export type ViewType = 'party' | 'dm' | 'player';

/**
 * Full game state with all data (DM sees everything)
 */
export interface FullGameState {
  /** Core game state */
  game: GameState;
  /** Current party */
  party: Party | null;
  /** Characters in the party */
  characters: Character[];
  /** Current area */
  currentArea: Area | null;
  /** NPCs in current area */
  npcs: NPC[];
  /** All entity traits */
  traits: EntityTrait[];
  /** All relationships (true values) */
  relationships: Relationship[];
  /** Perceived relationships (subjective values) */
  perceivedRelationships: PerceivedRelationship[];
  /** Pending evolution suggestions */
  pendingEvolutions: PendingEvolution[];
  /** Current scene */
  currentScene: Scene | null;
  /** Recent narration text */
  recentNarration: string[];
}

/**
 * Filtered game state for party view
 * Display-only - no controls, no hidden data
 */
export interface PartyViewState {
  /** Narration text */
  narration: string[];
  /** Character avatars (display info only) */
  avatars: PartyAvatar[];
  /** Current scene info (public fields only) */
  scene: SceneDisplay | null;
  /** Current area display info */
  area: AreaDisplay | null;
}

/**
 * Avatar information for party view
 */
export interface PartyAvatar {
  id: string;
  name: string;
  pixelArtRef?: {
    path: string;
    spriteName: string;
  };
}

/**
 * Scene display info (public fields only)
 */
export interface SceneDisplay {
  id: string;
  name: string | null;
  sceneType: string | null;
  mood?: string;
}

/**
 * Area display info for party view
 */
export interface AreaDisplay {
  id: string;
  name: string;
  description: string;
}

/**
 * Filtered game state for player view
 * Shows character's perspective with filtered/perceived data
 */
export interface PlayerViewState {
  /** Core game state (minimal) */
  game: Pick<GameState, 'id' | 'turn' | 'currentAreaId'>;
  /** Player's character */
  character: Character | null;
  /** Party members (public info only) */
  partyMembers: PartyMemberView[];
  /** Current area */
  area: AreaDisplay | null;
  /** NPCs (public info only) */
  npcs: NPCView[];
  /** Character's own traits (visible to them) */
  ownTraits: FilteredTrait[];
  /** Perceived relationships (subjective values) */
  relationships: PlayerRelationshipView[];
  /** Recent narration */
  narration: string[];
  /** Current scene (public info) */
  scene: SceneDisplay | null;
}

/**
 * Party member view for player perspective
 */
export interface PartyMemberView {
  id: string;
  name: string;
  class: string;
  /** Only publicly visible traits */
  visibleTraits: string[];
}

/**
 * NPC view for player perspective
 */
export interface NPCView {
  id: string;
  name: string;
  description: string;
  disposition: string;
}

/**
 * Filtered trait (hides source/internal data)
 */
export interface FilteredTrait {
  trait: string;
  acquiredTurn: number;
}

/**
 * Player's perception of a relationship
 * Uses perceived values if available, otherwise shows "unknown"
 */
export interface PlayerRelationshipView {
  targetId: string;
  targetName: string;
  targetType: 'character' | 'npc';
  /** Perceived trust (null = unknown to character) */
  perceivedTrust: number | null;
  /** Perceived respect (null = unknown to character) */
  perceivedRespect: number | null;
  /** Perceived affection (null = unknown to character) */
  perceivedAffection: number | null;
  /** Note: fear/resentment are NEVER shown to perceiver */
}

/**
 * DM view returns FullGameState (everything)
 */
export type DMViewState = FullGameState;

/**
 * Union type for all filtered state types
 */
export type FilteredGameState = PartyViewState | PlayerViewState | DMViewState;
