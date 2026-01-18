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
  // Pixelsrc art types
  PixelArtRef,
  PixelArt,
  PixelArtAnimation,
  AnimationState,
  KeyframeData,
} from './types.js';

// Event types (SSE types are exported from ../sse/index.ts)
export type {
  EventType,
  ActorType,
  TargetType,
  CanonicalEvent,
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

// Beat types
export type {
  BeatType,
  NarrativeBeat,
  BeatMetadata,
  BeatSequenceStatus,
  BeatSequence,
} from './beats.js';

// Action vocabulary types
export type {
  ActionCategory,
  Action,
  MercyAction,
  ViolenceAction,
  HonestyAction,
  SocialAction,
  ExplorationAction,
  CharacterAction,
} from './actions.js';

// Action vocabulary constants and helpers
export {
  ACTION_CATEGORIES,
  MERCY_ACTIONS,
  VIOLENCE_ACTIONS,
  HONESTY_ACTIONS,
  SOCIAL_ACTIONS,
  EXPLORATION_ACTIONS,
  CHARACTER_ACTIONS,
  ALL_ACTIONS,
  ACTION_TO_CATEGORY,
  CATEGORY_TO_ACTIONS,
  isActionInCategory,
  getActionCategory,
  isValidAction,
  isValidActionCategory,
} from './actions.js';
