/**
 * Evolution Service
 *
 * Coordinates entity evolution through traits and relationships.
 * Manages pending evolution suggestions and DM approval workflow.
 */

export { EvolutionService, type EvolutionServiceConfig } from './evolution-service.js';
export type {
  EvolutionSuggestion,
  GameEventRef,
  AggregateLabel,
  EntitySummary,
  RelationshipSummary,
  RelationshipDimensions,
  EvolutionEvent,
  EvolutionEventEmitter,
} from './types.js';
