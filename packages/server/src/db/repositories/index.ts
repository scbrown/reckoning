/**
 * Database Repositories
 *
 * Clean interfaces for database access, abstracting SQLite operations.
 */

export { GameRepository } from './game-repository.js';
export { EventRepository } from './event-repository.js';
export {
  AreaRepository,
  type CreateAreaInput,
  type CreateAreaExitInput,
  type CreateAreaObjectInput,
  type CreateNPCInput,
} from './area-repository.js';
export { PartyRepository } from './party-repository.js';
export { SaveRepository, type SaveSlot } from './save-repository.js';
export { EditorStateRepository } from './editor-state-repository.js';
export {
  CharacterRepository,
  type CharacterRole,
  type CharacterWithRole,
  type CreateCharacterInput,
  PARTY_LIMITS,
} from './character-repository.js';
export {
  RelationshipRepository,
  type EntityType,
  type RelationshipDimension,
  type Entity,
  type Relationship,
  type UpsertRelationshipInput,
  type ThresholdOperator,
  RELATIONSHIP_DIMENSIONS,
  DIMENSION_DEFAULTS,
} from './relationship-repository.js';
export {
  TraitRepository,
  type TraitStatus,
  type TraitCategory,
  type EntityTrait,
  type AddTraitInput,
  type TraitCatalogEntry,
} from './trait-repository.js';
export {
  PendingEvolutionRepository,
  type EvolutionType,
  type EvolutionStatus,
  type RelationshipDimension as EvolutionRelationshipDimension,
  type PendingEvolution,
  type CreateTraitEvolutionInput,
  type CreateRelationshipEvolutionInput,
  type CreateEvolutionInput,
  type ResolveEvolutionInput,
  type UpdateEvolutionInput,
} from './pending-evolution-repository.js';
export {
  EmergenceNotificationRepository,
  type CreateEmergenceNotificationInput,
  type ResolveNotificationInput,
} from './emergence-notification-repository.js';
export {
  SceneConnectionRepository,
  type ConnectionType,
  type ConnectionRequirements,
  type RelationshipRequirement,
  type SceneConnection,
  type CreateSceneConnectionInput,
  CONNECTION_TYPES,
} from './scene-connection-repository.js';
export {
  SceneAvailabilityRepository,
  type SceneUnlockInfo,
} from './scene-availability-repository.js';
export {
  SceneRepository,
  type SceneStatus,
  type Scene,
  type CreateSceneInput,
  type UpdateSceneInput,
  type SceneEvent,
} from './scene-repository.js';
export {
  WorldSeedRepository,
  type WorldSeed,
  type WorldSeedTone,
  type CharacterRole as WorldSeedCharacterRole,
  type WorldSeedRecord,
  type WorldSeedFull,
  type CreateWorldSeedInput,
} from './world-seed-repository.js';
