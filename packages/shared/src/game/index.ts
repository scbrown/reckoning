/**
 * Game Types
 *
 * Shared types for the game engine, DM system, and event handling.
 */

// Core game types
export type {
  GameState,
  GameSession,
  Area,
  AreaExit,
  AreaObject,
  Party,
  Character,
  CharacterStats,
  NPC,
  NPCDisposition,
} from './types.js';

// Event types
export type {
  EventType,
  CanonicalEvent,
  SSEEvent,
  GenerationStartedEvent,
  GenerationCompleteEvent,
  GenerationErrorEvent,
  StateChangedEvent,
  TTSStartedEvent,
  TTSCompleteEvent,
  EditorStateEvent,
} from './events.js';

// Generation types
export type {
  GenerationType,
  GenerationContext,
  GeneratedContent,
  GenerationMetadata,
  ContentGenerator,
  ContextBuilder,
} from './generation.js';

// DM types
export type {
  EditorStatus,
  DMEditorState,
  DMAction,
  AcceptAction,
  EditAction,
  RegenerateAction,
  InjectAction,
  PlaybackMode,
} from './dm.js';

// Status types
export type {
  ComponentStatus,
  AIStatus,
  TTSStatus,
  DBStatus,
  SystemStatus,
  GameObservation,
} from './status.js';
