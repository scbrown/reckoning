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
