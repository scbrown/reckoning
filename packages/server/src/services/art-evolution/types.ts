/**
 * Art Evolution Types
 *
 * Types for the art evolution system that evolves character art
 * over game progression based on various triggers.
 */

import type { EntityType } from '../../db/repositories/trait-repository.js';

/**
 * Triggers that can cause art evolution
 */
export type ArtEvolutionTrigger =
  | 'act_transition'    // When the game act changes
  | 'major_event'       // Significant story events
  | 'status_effect'     // Trait-based visual changes
  | 'equipment_change'; // Equipment/gear changes

/**
 * Strategies for how art evolves
 */
export type ArtEvolutionStrategy =
  | 'variant'       // Palette swap - modify colors
  | 'composition'   // Layer-based - add overlays
  | 'regenerate';   // Full regeneration - new art from AI

/**
 * Context for an art evolution trigger
 */
export interface ArtEvolutionTriggerContext {
  /** Type of trigger */
  trigger: ArtEvolutionTrigger;
  /** ID of the game */
  gameId: string;
  /** Current turn number */
  turn: number;
  /** Entity being evolved */
  entityType: EntityType;
  entityId: string;
  /** Trigger-specific data */
  data: ActTransitionData | MajorEventData | StatusEffectData | EquipmentChangeData;
}

/**
 * Data for act transition trigger
 */
export interface ActTransitionData {
  type: 'act_transition';
  /** Previous act number */
  fromAct: number;
  /** New act number */
  toAct: number;
}

/**
 * Data for major event trigger
 */
export interface MajorEventData {
  type: 'major_event';
  /** ID of the triggering event */
  eventId: string;
  /** Type of the event */
  eventType: string;
  /** Brief description of the event */
  description: string;
}

/**
 * Data for status effect trigger
 */
export interface StatusEffectData {
  type: 'status_effect';
  /** Trait that was added/removed */
  trait: string;
  /** Whether the trait was added or removed */
  action: 'added' | 'removed';
}

/**
 * Data for equipment change trigger
 */
export interface EquipmentChangeData {
  type: 'equipment_change';
  /** Equipment slot that changed */
  slot: string;
  /** Previous item (if any) */
  previousItem?: string;
  /** New item (if any) */
  newItem?: string;
}

/**
 * Request for art evolution
 */
export interface ArtEvolutionRequest {
  /** Context that triggered the evolution */
  triggerContext: ArtEvolutionTriggerContext;
  /** Strategy to use for evolution */
  strategy: ArtEvolutionStrategy;
  /** Current pixelsrc source */
  currentSource: string;
  /** Current sprite name */
  currentSpriteName: string;
  /** Optional parameters for the evolution */
  params?: ArtEvolutionParams;
}

/**
 * Parameters for art evolution strategies
 */
export interface ArtEvolutionParams {
  /** For variant strategy: palette modifications */
  paletteModifications?: PaletteModification[];
  /** For composition strategy: layers to add */
  layers?: CompositionLayer[];
  /** For regenerate strategy: AI prompt hints */
  promptHints?: string[];
}

/**
 * Palette color modification
 */
export interface PaletteModification {
  /** Original color key in palette */
  originalKey: string;
  /** New color value (hex) */
  newColor: string;
}

/**
 * Layer for composition strategy
 */
export interface CompositionLayer {
  /** Sprite name for this layer */
  spriteName: string;
  /** Z-index for layering (higher = on top) */
  zIndex: number;
  /** Optional offset */
  offset?: { x: number; y: number };
  /** Optional opacity (0-1) */
  opacity?: number;
}

/**
 * Result of an art evolution
 */
export interface ArtEvolutionResult {
  /** Whether the evolution was successful */
  success: boolean;
  /** New pixelsrc source (if successful) */
  newSource?: string;
  /** New sprite name */
  newSpriteName?: string;
  /** Archive entry for the old art */
  archiveEntry?: ArtArchiveEntry;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Entry in the art history archive
 */
export interface ArtArchiveEntry {
  /** Unique ID for this archive entry */
  id: string;
  /** Game this entry belongs to */
  gameId: string;
  /** Entity this art belonged to */
  entityType: EntityType;
  entityId: string;
  /** The pixelsrc source at this point */
  source: string;
  /** Sprite name */
  spriteName: string;
  /** Turn when this version was active from */
  fromTurn: number;
  /** Turn when this version was replaced (undefined if current) */
  toTurn?: number;
  /** What triggered the evolution that replaced this */
  trigger?: ArtEvolutionTrigger;
  /** When this entry was created */
  createdAt: string;
}

/**
 * Full art evolution history for an entity
 */
export interface ArtEvolutionHistory {
  /** Entity identification */
  entityType: EntityType;
  entityId: string;
  /** Current active art */
  current: ArtArchiveEntry | null;
  /** Historical art versions (newest first) */
  history: ArtArchiveEntry[];
}

/**
 * Events emitted by the art evolution service
 */
export type ArtEvolutionEvent =
  | { type: 'art:evolution_started'; request: ArtEvolutionRequest }
  | { type: 'art:evolution_completed'; result: ArtEvolutionResult; request: ArtEvolutionRequest }
  | { type: 'art:evolution_failed'; error: string; request: ArtEvolutionRequest }
  | { type: 'art:archived'; entry: ArtArchiveEntry };

/**
 * Event emitter interface for art evolution events
 */
export interface ArtEvolutionEventEmitter {
  emit(event: ArtEvolutionEvent): void;
}

/**
 * Trait visual mappings - maps traits to visual modifications
 */
export interface TraitVisualMapping {
  /** Trait name */
  trait: string;
  /** Strategy to use when this trait is active */
  strategy: ArtEvolutionStrategy;
  /** Evolution parameters for this trait */
  params: ArtEvolutionParams;
}

/**
 * Configuration for predefined trait visual effects
 */
export const TRAIT_VISUAL_MAPPINGS: TraitVisualMapping[] = [
  // Emotional traits with palette modifications
  {
    trait: 'haunted',
    strategy: 'variant',
    params: {
      paletteModifications: [
        { originalKey: 'skin', newColor: '#c4b8a8' },  // Paler skin
        { originalKey: 'eyes', newColor: '#4a4a4a' },  // Darker eyes
      ],
    },
  },
  {
    trait: 'volatile',
    strategy: 'composition',
    params: {
      layers: [
        { spriteName: 'aura_unstable', zIndex: -1, opacity: 0.6 },
      ],
    },
  },
  {
    trait: 'broken',
    strategy: 'variant',
    params: {
      paletteModifications: [
        { originalKey: 'eyes', newColor: '#666666' },  // Dull eyes
      ],
    },
  },
  // Reputation traits with composition overlays
  {
    trait: 'feared',
    strategy: 'composition',
    params: {
      layers: [
        { spriteName: 'shadow_menacing', zIndex: -1, opacity: 0.4 },
      ],
    },
  },
  {
    trait: 'legendary',
    strategy: 'composition',
    params: {
      layers: [
        { spriteName: 'glow_heroic', zIndex: -1, opacity: 0.3 },
      ],
    },
  },
  {
    trait: 'disgraced',
    strategy: 'variant',
    params: {
      paletteModifications: [
        { originalKey: 'clothes', newColor: '#5a5a5a' },  // Muted clothing
      ],
    },
  },
];
