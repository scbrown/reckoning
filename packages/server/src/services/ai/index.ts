/**
 * AI Services
 *
 * AI provider implementations for executing prompts.
 */

export type {
  AIRequest,
  AIResponse,
  AIError,
  AIErrorCode,
  AIProvider,
  OutputSchema,
} from './types.js';

export { ClaudeCodeCLI, type ClaudeCLIConfig } from './claude-cli.js';

export { GAME_CONTENT_SCHEMA, WORLD_GENERATION_SCHEMA } from './schemas.js';

export {
  WorldGenerator,
  type WorldGenerationOptions,
  type GeneratedWorld,
  type WorldGenerationError,
} from './world-generator.js';

export {
  createContextBuilder,
  DefaultContextBuilder,
  type ContextBuilder,
  type ContextBuildOptions,
  type ContextBuilderOptions,
  type ExtendedGenerationContext,
  type EntityEvolutionContext,
  type GameRepository,
  type EventRepository,
  type AreaRepository,
  type AreaWithDetails,
  type PartyRepository,
  type EvolutionRepository,
} from './context-builder.js';

export {
  AreaObjectSchema,
  AreaExitSchema,
  NPCDispositionSchema,
  NPCSchema,
  AreaSchema,
  WorldGenerationOutputSchema,
  parseWorldGenerationOutput,
  safeParseWorldGenerationOutput,
  type AreaObjectOutput,
  type AreaExitOutput,
  type NPCDispositionOutput,
  type NPCOutput,
  type AreaOutput,
  type WorldGenerationOutput,
} from './schemas.js';
