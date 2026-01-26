/**
 * Mock AI Provider for E2E Testing
 *
 * Returns deterministic responses without calling Claude CLI.
 * Use by setting USE_MOCK_AI=true environment variable.
 */

import { Ok } from '@reckoning/shared';
import type { Result } from '@reckoning/shared';
import type { AIProvider, AIRequest, AIResponse, AIError } from './types.js';

/**
 * Mock AI provider that returns instant, deterministic responses.
 * Used for e2e testing where we don't want real AI calls.
 */
export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  async execute(request: AIRequest): Promise<Result<AIResponse, AIError>> {
    console.log('[MockAI] Executing mock prompt (bypassing Claude CLI)');

    // Generate a deterministic response based on whether a schema is requested
    const content = this.generateMockContent(request);

    return Ok({
      content,
      durationMs: 50,
    });
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Generate mock content based on the request
   */
  private generateMockContent(request: AIRequest): string {
    // If a JSON schema is requested, return structured JSON
    if (request.outputSchema) {
      const schemaName = request.outputSchema.name;

      // Handle different schema types
      if (schemaName === 'game_content' || schemaName === 'GameContent') {
        return JSON.stringify({
          eventType: 'narration',
          content: 'The ancient stone walls of the tavern seem to breathe with stories untold. A warm fire crackles in the hearth as the adventurer surveys their surroundings.',
          speaker: null,
          suggestedActions: [
            'Approach the bartender',
            'Look around the room',
            'Check your equipment',
          ],
        });
      }

      if (schemaName === 'beat_sequence' || schemaName === 'BeatSequence') {
        return JSON.stringify({
          beats: [
            {
              type: 'narration',
              content: 'The tavern door creaks open.',
              emotion: 'neutral',
            },
            {
              type: 'description',
              content: 'Warm light spills across the worn wooden floor.',
              emotion: 'calm',
            },
          ],
        });
      }

      if (schemaName === 'world_generation' || schemaName === 'WorldGeneration') {
        return JSON.stringify({
          areas: [
            {
              name: 'Town Square',
              description: 'A bustling marketplace filled with vendors.',
              exits: [{ direction: 'north', destination: 'Castle Gates' }],
              npcs: [],
              objects: [],
            },
          ],
        });
      }

      // Default structured response
      return JSON.stringify({
        eventType: 'narration',
        content: 'A mysterious event unfolds before you.',
        speaker: null,
      });
    }

    // Plain text response for prompts without schema
    return 'The world around you pulses with adventure. What will you do next?';
  }
}

/**
 * Check if mock AI should be used based on environment
 */
export function shouldUseMockAI(): boolean {
  return process.env.USE_MOCK_AI === 'true' || process.env.NODE_ENV === 'test';
}
