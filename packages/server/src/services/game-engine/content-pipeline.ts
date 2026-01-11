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
} from '@reckoning/shared';
import { Ok, Err } from '@reckoning/shared';
import type {
  ContextBuilder,
  ExtendedGenerationContext,
} from '../ai/context-builder.js';
import type { AIProvider } from '../ai/types.js';
import { GAME_CONTENT_SCHEMA } from '../ai/schemas.js';
import {
  buildPrompt,
  type PromptBuildContext,
  type SceneContext,
  type PartyContext,
} from '../ai/prompts/index.js';

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

// =============================================================================
// ContentPipeline Class
// =============================================================================

/**
 * Generates content via AI provider using context and prompts.
 */
export class ContentPipeline {
  constructor(
    private contextBuilder: ContextBuilder,
    private aiProvider: AIProvider
  ) {}

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
    const generatedContent = this.parseResponse(
      aiResult.value.content,
      type
    );
    console.log(`[ContentPipeline] Generation complete for ${type}`);

    return Ok(generatedContent);
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
   *   "suggestedActions": ["optional", "follow-up", "options"]
   * }
   *
   * If JSON parsing fails, falls back to treating the response as plain text.
   */
  private parseResponse(
    response: string,
    generationType: GenerationType
  ): GeneratedContent {
    // Try to parse as JSON first
    const jsonResult = this.tryParseJsonResponse(response);

    if (jsonResult) {
      console.log('[ContentPipeline] Successfully parsed JSON response');
      // Build metadata object only with defined values (exactOptionalPropertyTypes)
      const metadata: GeneratedContent['metadata'] = {};
      if (jsonResult.speaker) {
        metadata.speaker = jsonResult.speaker;
      }
      if (jsonResult.suggestedActions && jsonResult.suggestedActions.length > 0) {
        metadata.suggestedActions = jsonResult.suggestedActions;
      }

      return {
        id: randomUUID(),
        generationType,
        eventType: jsonResult.eventType,
        content: jsonResult.content,
        metadata,
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
      id: randomUUID(),
      generationType,
      eventType,
      content,
      metadata,
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
  private tryParseJsonResponse(response: string): {
    eventType: EventType;
    content: string;
    speaker: string | null;
    suggestedActions?: string[];
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
        content: parsed.content.trim(),
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

      return result;
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
}
