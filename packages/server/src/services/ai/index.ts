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
} from './types.js';

export { ClaudeCodeCLI, type ClaudeCLIConfig } from './claude-cli.js';

export {
  createContextBuilder,
  DefaultContextBuilder,
  type ContextBuilder,
  type ContextBuildOptions,
  type ExtendedGenerationContext,
  type GameRepository,
  type EventRepository,
  type AreaRepository,
  type AreaWithDetails,
  type PartyRepository,
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
