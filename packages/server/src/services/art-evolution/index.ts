/**
 * Art Evolution Service
 *
 * Service for evolving character art over game progression.
 * Supports triggers (act transitions, events, traits, equipment)
 * and strategies (variant, composition, regenerate).
 */

export { ArtEvolutionService, type ArtEvolutionServiceConfig } from './art-evolution-service.js';
export type {
  ArtEvolutionTrigger,
  ArtEvolutionStrategy,
  ArtEvolutionTriggerContext,
  ArtEvolutionRequest,
  ArtEvolutionResult,
  ArtEvolutionParams,
  PaletteModification,
  CompositionLayer,
  ArtArchiveEntry,
  ArtEvolutionHistory,
  ArtEvolutionEvent,
  ArtEvolutionEventEmitter,
  TraitVisualMapping,
  ActTransitionData,
  MajorEventData,
  StatusEffectData,
  EquipmentChangeData,
} from './types.js';
export { TRAIT_VISUAL_MAPPINGS } from './types.js';
