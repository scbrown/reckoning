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
    // Build context - only pass options if dmGuidance is defined
    let context: ExtendedGenerationContext;
    try {
      const buildOptions = options?.dmGuidance !== undefined
        ? { dmGuidance: options.dmGuidance }
        : undefined;
      context = await this.contextBuilder.build(gameId, type, buildOptions);
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
    const promptContext = this.buildPromptContext(context, type);
    const prompt = buildPrompt(promptContext);

    // Execute AI generation
    const aiResult = await this.aiProvider.execute({
      prompt: prompt.combined,
    });

    if (!aiResult.ok) {
      return Err({
        code: 'AI_ERROR',
        message: aiResult.error.message,
        retryable: aiResult.error.retryable,
      });
    }

    // Parse response into GeneratedContent
    const generatedContent = this.parseResponse(
      aiResult.value.content,
      type
    );

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
   * Parse AI response into GeneratedContent
   */
  private parseResponse(
    response: string,
    generationType: GenerationType
  ): GeneratedContent {
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
