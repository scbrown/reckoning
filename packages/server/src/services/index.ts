/**
 * Server Services
 *
 * Re-exports all service modules for convenient importing.
 */

export {
  voiceRegistry,
  getAvailableVoices,
  findVoiceById,
  getDefaultPartyVoice,
  getVoiceForCharacter,
  getPartyVoicePool,
} from './voice-registry.js';
export type { CharacterVoiceMapping } from './voice-registry.js';

export { ElevenLabsClient } from './elevenlabs/client.js';
export { ElevenLabsError } from './elevenlabs/types.js';
export { TTSCacheService } from './cache/tts-cache-service.js';

export {
  ClaudeCodeCLI,
  type ClaudeCLIConfig,
  type AIProvider,
  type AIRequest,
  type AIResponse,
  type AIError,
  type AIErrorCode,
} from './ai/index.js';

export {
  BroadcastManager,
  broadcastManager,
  setupSSEResponse,
  formatSSEMessage,
} from './sse/index.js';

export type {
  SSEClient,
  SSEEvent,
  SubscribeOptions,
  BroadcastManagerOptions,
  BroadcastStats,
} from './sse/index.js';

export {
  PixelsrcRenderer,
  PixelsrcRenderError,
} from './pixelsrc/index.js';
export type { RenderOptions, RenderResult } from './pixelsrc/index.js';

export { EvolutionService, type EvolutionServiceConfig } from './evolution/index.js';
export type {
  EvolutionSuggestion,
  GameEventRef,
  AggregateLabel,
  EntitySummary,
  RelationshipSummary,
  RelationshipDimensions,
  EvolutionEvent,
  EvolutionEventEmitter,
} from './evolution/index.js';

export {
  ArtEvolutionService,
  TRAIT_VISUAL_MAPPINGS,
  type ArtEvolutionServiceConfig,
} from './art-evolution/index.js';
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
} from './art-evolution/index.js';
