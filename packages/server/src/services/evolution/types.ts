import type { EntityType } from '../../db/repositories/trait-repository.js';
import type { RelationshipDimension } from '../../db/repositories/relationship-repository.js';
import type { EvolutionType } from '../../db/repositories/pending-evolution-repository.js';

/**
 * AI-generated evolution suggestion
 */
export interface EvolutionSuggestion {
  evolutionType: EvolutionType;
  entityType: EntityType;
  entityId: string;
  reason: string;

  // For trait evolutions
  trait?: string;

  // For relationship evolutions
  targetType?: EntityType;
  targetId?: string;
  dimension?: RelationshipDimension;
  change?: number; // Delta to apply to current value
}

/**
 * Game event reference (minimal interface for what we need)
 */
export interface GameEventRef {
  id: string;
  turn: number;
  gameId: string;
}

/**
 * Aggregate relationship labels computed from dimensions
 */
export type AggregateLabel =
  | 'devoted'     // High trust + affection + respect
  | 'ally'        // High trust + respect
  | 'friend'      // High affection + trust
  | 'rival'       // High respect + resentment
  | 'enemy'       // High fear + resentment
  | 'terrified'   // High fear
  | 'resentful'   // High resentment
  | 'indebted'    // High debt
  | 'indifferent' // Neutral across dimensions
  | 'wary';       // Moderate fear or low trust

/**
 * Entity summary with traits and relationships
 */
export interface EntitySummary {
  entityType: EntityType;
  entityId: string;
  traits: string[];
  relationships: RelationshipSummary[];
}

/**
 * Summary of a relationship for display
 */
export interface RelationshipSummary {
  targetType: EntityType;
  targetId: string;
  label: AggregateLabel;
  dimensions: RelationshipDimensions;
}

/**
 * Relationship dimension values
 */
export interface RelationshipDimensions {
  trust: number;
  respect: number;
  affection: number;
  fear: number;
  resentment: number;
  debt: number;
}

/**
 * Evolution event types for event emission
 */
export type EvolutionEvent =
  | { type: 'evolution:created'; pending: import('../../db/repositories/pending-evolution-repository.js').PendingEvolution }
  | { type: 'evolution:approved'; pending: import('../../db/repositories/pending-evolution-repository.js').PendingEvolution }
  | { type: 'evolution:edited'; pending: import('../../db/repositories/pending-evolution-repository.js').PendingEvolution }
  | { type: 'evolution:refused'; pending: import('../../db/repositories/pending-evolution-repository.js').PendingEvolution };

/**
 * Optional event emitter interface
 * Services can provide their own implementation
 */
export interface EvolutionEventEmitter {
  emit(event: EvolutionEvent): void;
}
