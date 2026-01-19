/**
 * Content Pipeline
 *
 * Handles the Generate → Review → Submit pipeline for AI content.
 */

import { randomUUID } from 'crypto';
import type {
  GeneratedContent,
  GenerationType,
  EventType,
  Result,
  NarrativeBeat,
  BeatSequence,
  BeatType,
} from '@reckoning/shared';
import { Ok, Err } from '@reckoning/shared';
import type {
  ContextBuilder,
  ExtendedGenerationContext,
} from '../ai/context-builder.js';
import type { AIProvider } from '../ai/types.js';
import {
  GAME_CONTENT_SCHEMA,
  BEAT_SEQUENCE_SCHEMA,
  safeParseBeatSequenceOutput,
  extractEvolutionSuggestions,
  type AIBeatOutput,
  type EvolutionSuggestionOutput,
} from '../ai/schemas.js';
import {
  buildPrompt,
  buildBeatPrompt,
  type PromptBuildContext,
  type SceneContext,
  type PartyContext,
} from '../ai/prompts/index.js';
import type { EvolutionService, EvolutionSuggestion, GameEventRef } from '../evolution/index.js';
import {
  EventBuilder,
  type AIStructuredMetadata,
} from '../events/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for content generation
 */
export interface GenerateOptions {
  /** Optional DM guidance for generation */
  dmGuidance?: string;
}

/**
 * Error from content pipeline
 */
export interface PipelineError {
  code: 'GAME_NOT_FOUND' | 'AREA_NOT_FOUND' | 'AI_ERROR' | 'PARSE_ERROR';
  message: string;
  retryable: boolean;
}

/**
 * Configuration options for ContentPipeline
 */
export interface ContentPipelineConfig {
  contextBuilder: ContextBuilder;
  aiProvider: AIProvider;
  evolutionService?: EvolutionService;
  eventBuilder?: EventBuilder;
}

// =============================================================================
// ContentPipeline Class
// =============================================================================

/**
 * Generates content via AI provider using context and prompts.
 * Optionally detects entity evolutions after content generation.
 */
export class ContentPipeline {
  private contextBuilder: ContextBuilder;
  private aiProvider: AIProvider;
  private evolutionService: EvolutionService | undefined;
  private eventBuilder: EventBuilder;

  constructor(config: ContentPipelineConfig);
  constructor(contextBuilder: ContextBuilder, aiProvider: AIProvider);
  constructor(
    configOrContextBuilder: ContentPipelineConfig | ContextBuilder,
    aiProvider?: AIProvider
  ) {
    if ('contextBuilder' in configOrContextBuilder) {
      // New config-based constructor
      this.contextBuilder = configOrContextBuilder.contextBuilder;
      this.aiProvider = configOrContextBuilder.aiProvider;
      this.evolutionService = configOrContextBuilder.evolutionService;
      this.eventBuilder = configOrContextBuilder.eventBuilder ?? new EventBuilder();
    } else {
      // Legacy two-argument constructor for backwards compatibility
      this.contextBuilder = configOrContextBuilder;
      this.aiProvider = aiProvider!;
      this.eventBuilder = new EventBuilder();
    }
  }

  /**
   * Generate content for a game
   *
   * @param gameId - ID of the game
   * @param type - Type of content to generate
   * @param options - Generation options
   * @returns Result with GeneratedContent on success, PipelineError on failure
   */
  async generate(
    gameId: string,
    type: GenerationType,
    options?: GenerateOptions
  ): Promise<Result<GeneratedContent, PipelineError>> {
    console.log(`[ContentPipeline] Starting ${type} generation for game ${gameId}`);
    const startTime = Date.now();

    // Build context - only pass options if dmGuidance is defined
    let context: ExtendedGenerationContext;
    try {
      console.log('[ContentPipeline] Building context...');
      const buildOptions = options?.dmGuidance !== undefined
        ? { dmGuidance: options.dmGuidance }
        : undefined;
      context = await this.contextBuilder.build(gameId, type, buildOptions);
      console.log('[ContentPipeline] Context built successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('Game not found')) {
        return Err({
          code: 'GAME_NOT_FOUND',
          message,
          retryable: false,
        });
      }
      if (message.includes('Area not found')) {
        return Err({
          code: 'AREA_NOT_FOUND',
          message,
          retryable: false,
        });
      }
      return Err({
        code: 'AI_ERROR',
        message,
        retryable: false,
      });
    }

    // Build prompt with type-specific context
    console.log('[ContentPipeline] Building prompt...');
    const promptContext = this.buildPromptContext(context, type);
    const prompt = buildPrompt(promptContext);
    console.log(`[ContentPipeline] Prompt ready (${prompt.combined.length} chars)`);

    // Execute AI generation with structured output schema
    console.log('[ContentPipeline] Calling AI provider with game content schema...');
    const aiResult = await this.aiProvider.execute({
      prompt: prompt.combined,
      outputSchema: GAME_CONTENT_SCHEMA,
    });

    if (!aiResult.ok) {
      const elapsed = Date.now() - startTime;
      console.error(`[ContentPipeline] AI error after ${elapsed}ms: ${aiResult.error.message}`);
      return Err({
        code: 'AI_ERROR',
        message: aiResult.error.message,
        retryable: aiResult.error.retryable,
      });
    }

    // Parse response into GeneratedContent
    const elapsed = Date.now() - startTime;
    console.log(`[ContentPipeline] AI response received after ${elapsed}ms (${aiResult.value.content.length} chars)`);
    const { generatedContent, parsedResponse } = this.parseResponseWithRaw(
      aiResult.value.content,
      type
    );

    // Build structured event data using EventBuilder (SEVT-008)
    const aiMetadata = this.extractAIStructuredMetadata(parsedResponse);
    const buildParams: Parameters<typeof this.eventBuilder.buildFromGeneration>[0] = {
      generationType: type,
      eventType: generatedContent.eventType,
      content: generatedContent.content,
      npcsPresent: context.npcsPresent.map(npc => ({ id: npc.id, name: npc.name })),
      partyMembers: context.party.map(char => ({ id: char.id, name: char.name })),
      locationId: context.currentArea.id,
    };
    if (aiMetadata) {
      buildParams.metadata = aiMetadata;
    }
    if (generatedContent.metadata.speaker) {
      buildParams.speaker = generatedContent.metadata.speaker;
    }
    const structuredData = this.eventBuilder.buildFromGeneration(buildParams);

    // Merge structured data into metadata
    if (structuredData.action) {
      generatedContent.metadata.action = structuredData.action;
    }
    if (structuredData.actorType) {
      generatedContent.metadata.actorType = structuredData.actorType;
    }
    if (structuredData.actorId) {
      generatedContent.metadata.actorId = structuredData.actorId;
    }
    if (structuredData.targetType) {
      generatedContent.metadata.targetType = structuredData.targetType;
    }
    if (structuredData.targetId) {
      generatedContent.metadata.targetId = structuredData.targetId;
    }
    if (structuredData.witnesses.length > 0) {
      generatedContent.metadata.witnesses = structuredData.witnesses;
    }
    if (structuredData.tags.length > 0) {
      generatedContent.metadata.tags = structuredData.tags;
    }

    console.log(`[ContentPipeline] Generation complete for ${type} with structured data`);

    // Detect evolutions if EvolutionService is configured
    if (this.evolutionService && parsedResponse) {
      await this.detectEvolutions(
        gameId,
        context.gameState.turn,
        generatedContent.id,
        parsedResponse
      );
    }

    return Ok(generatedContent);
  }

  /**
   * Generate a beat sequence for a game
   *
   * This method generates content as a sequence of narrative beats,
   * each representing an atomic unit suitable for TTS playback.
   *
   * @param gameId - ID of the game
   * @param type - Type of content to generate
   * @param options - Generation options
   * @returns Result with BeatSequence on success, PipelineError on failure
   */
  async generateBeats(
    gameId: string,
    type: GenerationType,
    options?: GenerateOptions
  ): Promise<Result<BeatSequence, PipelineError>> {
    console.log(`[ContentPipeline] Starting beat sequence generation for game ${gameId}`);
    const startTime = Date.now();

    // Build context - only pass options if dmGuidance is defined
    let context: ExtendedGenerationContext;
    try {
      console.log('[ContentPipeline] Building context for beats...');
      const buildOptions = options?.dmGuidance !== undefined
        ? { dmGuidance: options.dmGuidance }
        : undefined;
      context = await this.contextBuilder.build(gameId, type, buildOptions);
      console.log('[ContentPipeline] Context built successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('Game not found')) {
        return Err({
          code: 'GAME_NOT_FOUND',
          message,
          retryable: false,
        });
      }
      if (message.includes('Area not found')) {
        return Err({
          code: 'AREA_NOT_FOUND',
          message,
          retryable: false,
        });
      }
      return Err({
        code: 'AI_ERROR',
        message,
        retryable: false,
      });
    }

    // Build prompt with type-specific context using beat prompt builder
    console.log('[ContentPipeline] Building beat prompt...');
    const promptContext = this.buildPromptContext(context, type);
    const prompt = buildBeatPrompt(promptContext);
    console.log(`[ContentPipeline] Beat prompt ready (${prompt.combined.length} chars)`);

    // Execute AI generation with beat sequence schema
    console.log('[ContentPipeline] Calling AI provider with beat sequence schema...');
    const aiResult = await this.aiProvider.execute({
      prompt: prompt.combined,
      outputSchema: BEAT_SEQUENCE_SCHEMA,
    });

    if (!aiResult.ok) {
      const elapsed = Date.now() - startTime;
      console.error(`[ContentPipeline] AI error after ${elapsed}ms: ${aiResult.error.message}`);
      return Err({
        code: 'AI_ERROR',
        message: aiResult.error.message,
        retryable: aiResult.error.retryable,
      });
    }

    // Parse response into BeatSequence
    const elapsed = Date.now() - startTime;
    console.log(`[ContentPipeline] AI response received after ${elapsed}ms (${aiResult.value.content.length} chars)`);

    const beatSequence = this.parseBeatResponse(
      aiResult.value.content,
      gameId,
      context.gameState.turn
    );

    if (!beatSequence) {
      return Err({
        code: 'PARSE_ERROR',
        message: 'Failed to parse beat sequence from AI response',
        retryable: true,
      });
    }

    console.log(`[ContentPipeline] Beat sequence generation complete with ${beatSequence.beats.length} beats`);
    return Ok(beatSequence);
  }

  /**
   * Build prompt context with type-specific data
   */
  private buildPromptContext(
    context: ExtendedGenerationContext,
    type: GenerationType
  ): PromptBuildContext {
    // Build base context, only including optional fields if defined
    const baseContext: PromptBuildContext = {
      type,
      gameState: context.gameState,
      recentHistory: context.recentHistory,
    };

    // Add optional fields only if they exist
    if (context.historyContext !== undefined) {
      baseContext.historyContext = context.historyContext;
    }
    if (context.dmGuidance !== undefined) {
      baseContext.dmGuidance = context.dmGuidance;
    }

    // Get area ID safely (AreaWithDetails extends Area which has id)
    const areaId = (context.currentArea as { id: string }).id;

    switch (type) {
      case 'narration': {
        const sceneContext: SceneContext = {
          area: context.currentArea,
          npcs: context.npcsPresent,
          isFirstVisit: context.recentHistory.length === 0,
        };
        return { ...baseContext, sceneContext };
      }

      case 'dm_continuation': {
        const partyContext: PartyContext = {
          party: context.party,
          currentArea: context.currentArea,
          recentEvents: [], // Would need to convert from strings
        };
        // Only add dmGuidance if defined
        if (context.dmGuidance !== undefined) {
          partyContext.dmGuidance = context.dmGuidance;
        }
        return { ...baseContext, partyContext };
      }

      case 'npc_response': {
        // For NPC response, we need the target NPC
        // Default to first NPC in area if none specified
        const targetNpc = context.npcsPresent[0];
        if (targetNpc) {
          return {
            ...baseContext,
            npcContext: {
              npc: targetNpc,
              triggeringEvent: {
                id: '',
                gameId: context.gameState.id,
                turn: context.gameState.turn,
                timestamp: new Date().toISOString(),
                eventType: 'party_action',
                content: context.recentHistory[context.recentHistory.length - 1] ?? '',
                locationId: areaId,
                witnesses: [],
              },
              currentArea: context.currentArea,
              recentEvents: [],
            },
          };
        }
        return baseContext;
      }

      case 'environment_reaction': {
        return {
          ...baseContext,
          environmentContext: {
            currentArea: context.currentArea,
            recentEvents: [],
            trigger: 'atmosphere',
          },
        };
      }

      default:
        return baseContext;
    }
  }

  /**
   * Expected JSON structure from AI response
   */
  private static readonly VALID_EVENT_TYPES = new Set([
    'party_action',
    'party_dialogue',
    'npc_action',
    'npc_dialogue',
    'narration',
    'environment',
  ]);

  /**
   * Parse AI response into GeneratedContent
   *
   * The AI is instructed to respond with JSON in this format:
   * {
   *   "eventType": "narration" | "party_action" | etc,
   *   "content": "The narrative text...",
   *   "speaker": "Character name or null",
   *   "suggestedActions": ["optional", "follow-up", "options"],
   *   "evolutions": [...] (optional)
   * }
   *
   * If JSON parsing fails, falls back to treating the response as plain text.
   */

  /**
   * Parse AI response into GeneratedContent and return raw parsed object.
   * Used for evolution detection which needs access to the full parsed response.
   */
  private parseResponseWithRaw(
    response: string,
    generationType: GenerationType
  ): { generatedContent: GeneratedContent; parsedResponse: Record<string, unknown> | null } {
    // Try to parse as JSON first
    const jsonResult = this.tryParseJsonResponseWithRaw(response);

    if (jsonResult) {
      console.log('[ContentPipeline] Successfully parsed JSON response');
      // Build metadata object only with defined values (exactOptionalPropertyTypes)
      const metadata: GeneratedContent['metadata'] = {};
      if (jsonResult.parsed.speaker) {
        metadata.speaker = jsonResult.parsed.speaker;
      }
      if (jsonResult.parsed.suggestedActions && jsonResult.parsed.suggestedActions.length > 0) {
        metadata.suggestedActions = jsonResult.parsed.suggestedActions;
      }

      return {
        generatedContent: {
          id: randomUUID(),
          generationType,
          eventType: jsonResult.parsed.eventType,
          content: jsonResult.parsed.content,
          metadata,
        },
        parsedResponse: jsonResult.raw,
      };
    }

    // Fallback: treat as plain text with regex extraction
    console.log('[ContentPipeline] JSON parse failed, falling back to text extraction');

    // Map generation type to event type
    const eventType = this.mapToEventType(generationType);

    // Extract metadata from response
    const metadata = this.extractMetadata(response, generationType);

    // Clean the content (remove any metadata markers)
    const content = this.cleanContent(response);

    return {
      generatedContent: {
        id: randomUUID(),
        generationType,
        eventType,
        content,
        metadata,
      },
      parsedResponse: null,
    };
  }

  /**
   * Try to parse AI response as JSON
   *
   * Handles various edge cases:
   * - Claude CLI wrapper format with structured_output field
   * - JSON wrapped in markdown code blocks
   * - Extra text before/after JSON
   * - Partial JSON with missing fields
   */

  /**
   * Try to parse AI response as JSON and return both parsed content and raw object.
   * The raw object is needed for evolution extraction.
   */
  private tryParseJsonResponseWithRaw(response: string): {
    parsed: {
      eventType: EventType;
      content: string;
      speaker: string | null;
      suggestedActions?: string[];
    };
    raw: Record<string, unknown>;
  } | null {
    const trimmed = response.trim();

    // Try to extract JSON from markdown code blocks
    let jsonStr = trimmed;
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      // Try to find JSON object in the response
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (jsonMatch && jsonMatch[0]) {
        jsonStr = jsonMatch[0];
      }
    }

    try {
      let parsed = JSON.parse(jsonStr) as Record<string, unknown>;

      // Handle Claude CLI wrapper format: { type: "result", structured_output: {...} }
      if (
        parsed.type === 'result' &&
        typeof parsed.structured_output === 'object' &&
        parsed.structured_output !== null
      ) {
        console.log('[ContentPipeline] Detected CLI wrapper format, extracting structured_output');
        parsed = parsed.structured_output as Record<string, unknown>;
      }

      // Validate required fields
      if (typeof parsed.content !== 'string' || !parsed.content.trim()) {
        console.log('[ContentPipeline] JSON missing or empty content field');
        return null;
      }

      // Validate and map eventType
      const rawEventType = parsed.eventType;
      let eventType: EventType = 'narration'; // default

      if (
        typeof rawEventType === 'string' &&
        ContentPipeline.VALID_EVENT_TYPES.has(rawEventType)
      ) {
        eventType = rawEventType as EventType;
      } else if (rawEventType !== undefined) {
        console.log(
          `[ContentPipeline] Unknown eventType "${rawEventType}", defaulting to narration`
        );
      }

      // Extract optional fields
      const speaker =
        typeof parsed.speaker === 'string' ? parsed.speaker : null;

      // Build return object, only including suggestedActions if present
      const result: {
        eventType: EventType;
        content: string;
        speaker: string | null;
        suggestedActions?: string[];
      } = {
        eventType,
        content: (parsed.content as string).trim(),
        speaker,
      };

      // Only add suggestedActions if present and non-empty
      if (Array.isArray(parsed.suggestedActions)) {
        const actions = (parsed.suggestedActions as unknown[]).filter(
          (a): a is string => typeof a === 'string'
        );
        if (actions.length > 0) {
          result.suggestedActions = actions;
        }
      }

      return { parsed: result, raw: parsed };
    } catch (e) {
      // JSON parse failed
      console.log(
        `[ContentPipeline] JSON parse error: ${e instanceof Error ? e.message : 'Unknown'}`
      );
      return null;
    }
  }

  /**
   * Map generation type to event type
   */
  private mapToEventType(type: GenerationType): EventType {
    switch (type) {
      case 'narration':
        return 'narration';
      case 'npc_response':
        return 'npc_dialogue';
      case 'environment_reaction':
        return 'environment';
      case 'dm_continuation':
        return 'narration';
      default:
        return 'narration';
    }
  }

  /**
   * Extract metadata from response
   */
  private extractMetadata(
    response: string,
    type: GenerationType
  ): GeneratedContent['metadata'] {
    const metadata: GeneratedContent['metadata'] = {};

    // For NPC responses, try to extract speaker
    if (type === 'npc_response') {
      // Look for speaker pattern at start: "Name:" or "[Name]"
      const speakerMatch = response.match(/^(?:\[([^\]]+)\]|([^:]+):)/);
      if (speakerMatch) {
        const speaker = speakerMatch[1] ?? speakerMatch[2];
        if (speaker) {
          metadata.speaker = speaker;
        }
      }
    }

    // Look for suggested actions (marked with *)
    const actionMatches = response.match(/^\* (.+)$/gm);
    if (actionMatches) {
      metadata.suggestedActions = actionMatches.map((m) =>
        m.replace(/^\* /, '')
      );
    }

    return metadata;
  }

  /**
   * Clean content by removing metadata markers
   */
  private cleanContent(response: string): string {
    // Remove suggested action lines at the end
    let cleaned = response.replace(/(\n\* .+)+$/g, '').trim();

    // Remove any system-level metadata markers
    cleaned = cleaned.replace(/^---[\s\S]*?---\n/g, '');

    return cleaned;
  }

  /**
   * Parse AI response into a BeatSequence
   *
   * Handles various edge cases:
   * - Claude CLI wrapper format with structured_output field
   * - JSON wrapped in markdown code blocks
   * - Validates beat types and content
   *
   * @param response - Raw AI response string
   * @param gameId - ID of the game
   * @param turn - Current turn number
   * @returns Parsed BeatSequence or null if parsing fails
   */
  private parseBeatResponse(
    response: string,
    gameId: string,
    turn: number
  ): BeatSequence | null {
    const trimmed = response.trim();

    // Try to extract JSON from markdown code blocks
    let jsonStr = trimmed;
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      // Try to find JSON object in the response
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (jsonMatch && jsonMatch[0]) {
        jsonStr = jsonMatch[0];
      }
    }

    try {
      let parsed = JSON.parse(jsonStr) as Record<string, unknown>;

      // Handle Claude CLI wrapper format: { type: "result", structured_output: {...} }
      if (
        parsed.type === 'result' &&
        typeof parsed.structured_output === 'object' &&
        parsed.structured_output !== null
      ) {
        console.log('[ContentPipeline] Detected CLI wrapper format for beats, extracting structured_output');
        parsed = parsed.structured_output as Record<string, unknown>;
      }

      // Use Zod schema for validation
      const validationResult = safeParseBeatSequenceOutput(parsed);
      if (!validationResult) {
        console.log('[ContentPipeline] Beat sequence validation failed');
        return null;
      }

      // Convert AIBeatOutput to NarrativeBeat
      const narrativeBeats: NarrativeBeat[] = validationResult.beats.map(
        (aiBeat: AIBeatOutput) => this.convertToBeat(aiBeat)
      );

      const beatSequence: BeatSequence = {
        id: randomUUID(),
        beats: narrativeBeats,
        gameId,
        turn,
        generatedAt: new Date().toISOString(),
        status: 'pending',
      };

      console.log(`[ContentPipeline] Successfully parsed ${beatSequence.beats.length} beats`);
      return beatSequence;
    } catch (e) {
      console.log(
        `[ContentPipeline] Beat sequence parse error: ${e instanceof Error ? e.message : 'Unknown'}`
      );
      return null;
    }
  }

  /**
   * Convert an AI beat output to a NarrativeBeat
   */
  private convertToBeat(aiBeat: AIBeatOutput): NarrativeBeat {
    const beat: NarrativeBeat = {
      id: randomUUID(),
      type: aiBeat.type as BeatType,
      content: aiBeat.content,
    };

    // Add optional fields only if defined
    if (aiBeat.speaker) {
      beat.speaker = aiBeat.speaker;
    }

    // Build metadata only if we have TTS hints
    if (aiBeat.emotion || aiBeat.volume || aiBeat.pace) {
      beat.metadata = {};
      if (aiBeat.emotion) {
        beat.metadata.emotion = aiBeat.emotion;
      }
      if (aiBeat.volume) {
        beat.metadata.volume = aiBeat.volume;
      }
      if (aiBeat.pace) {
        beat.metadata.pace = aiBeat.pace;
      }
    }

    return beat;
  }

  /**
   * Detect evolutions from parsed AI response and queue them for DM review.
   *
   * Extracts evolution suggestions from the AI response and passes them
   * to the EvolutionService for processing.
   *
   * @param gameId - ID of the game
   * @param turn - Current turn number
   * @param sourceEventId - ID of the generated content (used as source event)
   * @param parsedResponse - Raw parsed AI response containing potential evolutions
   */
  private async detectEvolutions(
    gameId: string,
    turn: number,
    sourceEventId: string,
    parsedResponse: Record<string, unknown>
  ): Promise<void> {
    if (!this.evolutionService) {
      return;
    }

    // Extract evolution suggestions from the parsed response
    const rawEvolutions = extractEvolutionSuggestions(parsedResponse);

    if (rawEvolutions.length === 0) {
      return;
    }

    console.log(`[ContentPipeline] Found ${rawEvolutions.length} evolution suggestions`);

    // Convert to EvolutionSuggestion format expected by EvolutionService
    const evolutionSuggestions: EvolutionSuggestion[] = rawEvolutions.map(
      (raw: EvolutionSuggestionOutput) => {
        const suggestion: EvolutionSuggestion = {
          evolutionType: raw.evolutionType,
          entityType: raw.entityType,
          entityId: raw.entityId,
          reason: raw.reason,
        };

        // Add optional fields
        if (raw.trait) {
          suggestion.trait = raw.trait;
        }
        if (raw.targetType) {
          suggestion.targetType = raw.targetType;
        }
        if (raw.targetId) {
          suggestion.targetId = raw.targetId;
        }
        if (raw.dimension) {
          suggestion.dimension = raw.dimension;
        }
        if (raw.change !== undefined) {
          suggestion.change = raw.change;
        }

        return suggestion;
      }
    );

    // Create the game event reference
    const event: GameEventRef = {
      id: sourceEventId,
      turn,
      gameId,
    };

    // Queue evolutions for DM review
    const pending = this.evolutionService.detectEvolutions(
      gameId,
      event,
      evolutionSuggestions
    );

    console.log(`[ContentPipeline] Queued ${pending.length} pending evolutions for DM review`);
  }

  /**
   * Valid actor types
   */
  private static readonly VALID_ACTOR_TYPES = new Set(['player', 'character', 'npc', 'system']);

  /**
   * Valid target types
   */
  private static readonly VALID_TARGET_TYPES = new Set(['player', 'character', 'npc', 'area', 'object']);

  /**
   * Extract AI-provided structured metadata from parsed response.
   * Looks for metadata fields like action, actor, targets, witnesses, tags.
   */
  private extractAIStructuredMetadata(
    parsedResponse: Record<string, unknown> | null
  ): AIStructuredMetadata | undefined {
    if (!parsedResponse) {
      return undefined;
    }

    // Check for metadata object in response
    const metadata = parsedResponse.metadata as Record<string, unknown> | undefined;
    if (!metadata) {
      // Also check for top-level structured fields (alternative AI output format)
      const topLevelMetadata: AIStructuredMetadata = {};
      if (typeof parsedResponse.action === 'string') {
        topLevelMetadata.action = parsedResponse.action;
      }
      const actor = this.parseActorRef(parsedResponse.actor);
      if (actor) {
        topLevelMetadata.actor = actor;
      }
      if (Array.isArray(parsedResponse.targets)) {
        const targets = this.parseTargetRefs(parsedResponse.targets);
        if (targets.length > 0) {
          topLevelMetadata.targets = targets;
        }
      }
      if (Array.isArray(parsedResponse.witnesses)) {
        const witnesses = this.parseWitnessRefs(parsedResponse.witnesses);
        if (witnesses.length > 0) {
          topLevelMetadata.witnesses = witnesses;
        }
      }
      if (Array.isArray(parsedResponse.tags)) {
        const tags = parsedResponse.tags.filter((t): t is string => typeof t === 'string');
        if (tags.length > 0) {
          topLevelMetadata.tags = tags;
        }
      }

      return Object.keys(topLevelMetadata).length > 0 ? topLevelMetadata : undefined;
    }

    // Extract from metadata object
    const aiMetadata: AIStructuredMetadata = {};

    if (typeof metadata.action === 'string') {
      aiMetadata.action = metadata.action;
    }
    const actor = this.parseActorRef(metadata.actor);
    if (actor) {
      aiMetadata.actor = actor;
    }
    if (Array.isArray(metadata.targets)) {
      const targets = this.parseTargetRefs(metadata.targets);
      if (targets.length > 0) {
        aiMetadata.targets = targets;
      }
    }
    if (Array.isArray(metadata.witnesses)) {
      const witnesses = this.parseWitnessRefs(metadata.witnesses);
      if (witnesses.length > 0) {
        aiMetadata.witnesses = witnesses;
      }
    }
    if (Array.isArray(metadata.tags)) {
      const tags = metadata.tags.filter((t): t is string => typeof t === 'string');
      if (tags.length > 0) {
        aiMetadata.tags = tags;
      }
    }

    return Object.keys(aiMetadata).length > 0 ? aiMetadata : undefined;
  }

  /**
   * Parse and validate an actor reference from unknown data
   */
  private parseActorRef(value: unknown): { type: 'player' | 'character' | 'npc' | 'system'; id: string } | undefined {
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }
    const obj = value as Record<string, unknown>;
    const type = obj.type;
    const id = obj.id;
    if (
      typeof type === 'string' &&
      typeof id === 'string' &&
      ContentPipeline.VALID_ACTOR_TYPES.has(type)
    ) {
      return {
        type: type as 'player' | 'character' | 'npc' | 'system',
        id,
      };
    }
    return undefined;
  }

  /**
   * Parse and validate target references from unknown array
   */
  private parseTargetRefs(values: unknown[]): Array<{ type: 'player' | 'character' | 'npc' | 'area' | 'object'; id: string }> {
    const results: Array<{ type: 'player' | 'character' | 'npc' | 'area' | 'object'; id: string }> = [];
    for (const value of values) {
      if (typeof value !== 'object' || value === null) {
        continue;
      }
      const obj = value as Record<string, unknown>;
      const type = obj.type;
      const id = obj.id;
      if (
        typeof type === 'string' &&
        typeof id === 'string' &&
        ContentPipeline.VALID_TARGET_TYPES.has(type)
      ) {
        results.push({
          type: type as 'player' | 'character' | 'npc' | 'area' | 'object',
          id,
        });
      }
    }
    return results;
  }

  /**
   * Parse and validate witness references from unknown array
   */
  private parseWitnessRefs(values: unknown[]): Array<{ type: 'player' | 'character' | 'npc' | 'system'; id: string }> {
    const results: Array<{ type: 'player' | 'character' | 'npc' | 'system'; id: string }> = [];
    for (const value of values) {
      if (typeof value !== 'object' || value === null) {
        continue;
      }
      const obj = value as Record<string, unknown>;
      const type = obj.type;
      const id = obj.id;
      if (
        typeof type === 'string' &&
        typeof id === 'string' &&
        ContentPipeline.VALID_ACTOR_TYPES.has(type)
      ) {
        results.push({
          type: type as 'player' | 'character' | 'npc' | 'system',
          id,
        });
      }
    }
    return results;
  }
}
