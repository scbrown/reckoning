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
  MockAIProvider,
  shouldUseMockAI,
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
  PixelsrcAIGenerator,
  PIXELSRC_FORMAT_PRIMER,
  PORTRAIT_GENERATION_PRIMER,
  SCENE_GENERATION_PRIMER,
  PALETTE_GENERATION_PRIMER,
  getPrimer,
} from './pixelsrc/index.js';
export type {
  RenderOptions,
  RenderResult,
  PortraitGenerationContext,
  AISceneGenerationContext,
  PaletteGenerationContext,
  AIGenerationResult,
  AIGenerationError,
  PixelsrcAIGeneratorConfig,
} from './pixelsrc/index.js';

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

export { EventBuilder, ActionClassifier } from './events/index.js';
export type {
  WitnessRef,
  TargetRef,
  ActorRef,
  AIStructuredMetadata,
  BuildFromGenerationParams,
  StructuredEventData,
  ClassificationResult,
  ActionClassifierConfig,
  PatternMatch,
} from './events/index.js';

export { PatternObserver } from './chronicle/index.js';
export type {
  PlayerPatterns,
  BehavioralRatios,
  ViolenceInitiationResult,
  SocialApproach,
  PatternObserverConfig,
  PatternAnalysisOptions,
} from './chronicle/index.js';

export { SceneManager, type SceneManagerConfig } from './scene/index.js';
export type {
  SceneEvent,
  SceneEventEmitter,
  SceneSummary,
  CreateSceneManagedInput,
  StartSceneInput,
  CompleteSceneInput,
} from './scene/index.js';

export {
  TomlExporter,
  JsonExporter,
  EXPORT_VERSION,
  EXPORT_FORMAT_VERSION,
  EXPORT_FORMAT_NAME,
  type TomlExporterConfig,
  type JsonExporterConfig,
  type ExportFormat,
  type TomlExportOptions,
  type ExportResult,
  type JsonExportOptions,
  type JsonExport,
  type JsonExportResult,
  type ExportedGame,
  type ExportedCharacter,
  type ExportedParty,
  type ExportedNPC,
  type ExportedArea,
  type ExportedScenes,
  type ExportedScene,
  type ExportedSceneConnection,
  type ExportedTraits,
  type ExportedRelationship,
  type ExportedEvent,
  type ExportedPendingEvolution,
  type ExportedEmergenceNotification,
  type ExportedFlags,
} from './export/index.js';

export { GameStateFilterService } from './view-filter/index.js';
export type {
  ViewType,
  FullGameState,
  PartyViewState,
  PlayerViewState,
  DMViewState,
  FilteredGameState,
  PartyAvatar,
  SceneDisplay,
  AreaDisplay,
  PartyMemberView,
  NPCView,
  FilteredTrait,
  PlayerRelationshipView,
} from './view-filter/index.js';

export {
  buildResearchPrompt,
  RESEARCH_SYSTEM_PROMPT,
  WORLD_SEEDING_RESEARCH_PROMPT,
} from './world-seeding/index.js';

export {
  applyPaletteShift,
  getPresetAdjustment,
  getAvailablePresets,
} from './palette-shift.js';
export type { PalettePreset, PaletteShift, PaletteZones } from './palette-shift.js';
