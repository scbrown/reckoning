/**
 * Database Repositories
 *
 * Clean interfaces for database access, abstracting SQLite operations.
 */

export { GameRepository } from './game-repository.js';
export { EventRepository } from './event-repository.js';
export { AreaRepository } from './area-repository.js';
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
