import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ContextBuilder, ExtendedGenerationContext } from '../../ai/context-builder.js';
import type { AIProvider, AIResponse, AIError } from '../../ai/types.js';
import { ContentPipeline } from '../content-pipeline.js';

describe('ContentPipeline', () => {
  let pipeline: ContentPipeline;
  let mockContextBuilder: ContextBuilder;
  let mockAIProvider: AIProvider;

  const mockContext: ExtendedGenerationContext = {
    type: 'narration',
    gameState: {
      id: 'game-123',
      playerId: 'player-1',
      currentAreaId: 'area-1',
      turn: 1,
      createdAt: '2026-01-10T12:00:00Z',
      updatedAt: '2026-01-10T12:00:00Z',
    },
    recentHistory: ['[narration] The adventure begins.'],
    currentArea: {
      id: 'area-1',
      name: 'Town Square',
      description: 'A bustling town square.',
      exits: [],
      objects: [],
      npcs: [],
      tags: [],
    },
    party: [
      {
        id: 'char-1',
        name: 'Marcus',
        description: 'A brave warrior',
        class: 'Warrior',
        stats: { health: 100, maxHealth: 100 },
      },
    ],
    npcsPresent: [],
  };

  beforeEach(() => {
    mockContextBuilder = {
      build: vi.fn().mockResolvedValue(mockContext),
    };

    mockAIProvider = {
      name: 'test-provider',
      execute: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          content: 'The fog rolls in, bringing with it a sense of mystery.',
          durationMs: 500,
        },
      }),
      isAvailable: vi.fn().mockResolvedValue(true),
    };

    pipeline = new ContentPipeline(mockContextBuilder, mockAIProvider);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generate', () => {
    it('should generate content successfully', async () => {
      const result = await pipeline.generate('game-123', 'narration');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe(
          'The fog rolls in, bringing with it a sense of mystery.'
        );
        expect(result.value.generationType).toBe('narration');
        expect(result.value.eventType).toBe('narration');
        expect(result.value.id).toBeDefined();
      }
    });

    it('should pass dmGuidance to context builder when provided', async () => {
      await pipeline.generate('game-123', 'narration', {
        dmGuidance: 'Make it spooky',
      });

      expect(mockContextBuilder.build).toHaveBeenCalledWith(
        'game-123',
        'narration',
        { dmGuidance: 'Make it spooky' }
      );
    });

    it('should return error when game not found', async () => {
      (mockContextBuilder.build as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Game not found: game-123')
      );

      const result = await pipeline.generate('game-123', 'narration');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('GAME_NOT_FOUND');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should return error when area not found', async () => {
      (mockContextBuilder.build as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Area not found: area-1')
      );

      const result = await pipeline.generate('game-123', 'narration');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AREA_NOT_FOUND');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should return error when AI fails', async () => {
      (mockAIProvider.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        error: {
          code: 'TIMEOUT',
          message: 'Request timed out',
          retryable: true,
        } as AIError,
      });

      const result = await pipeline.generate('game-123', 'narration');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AI_ERROR');
        expect(result.error.message).toBe('Request timed out');
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  describe('event type mapping', () => {
    it('should map narration to narration event type', async () => {
      const result = await pipeline.generate('game-123', 'narration');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.eventType).toBe('narration');
      }
    });

    it('should map npc_response to npc_dialogue event type', async () => {
      const contextWithNPCs = {
        ...mockContext,
        type: 'npc_response' as const,
        npcsPresent: [
          {
            id: 'npc-1',
            name: 'Old Wizard',
            description: 'A wise old wizard',
            currentAreaId: 'area-1',
            disposition: 'friendly' as const,
            tags: [],
          },
        ],
      };
      (mockContextBuilder.build as ReturnType<typeof vi.fn>).mockResolvedValue(
        contextWithNPCs
      );

      const result = await pipeline.generate('game-123', 'npc_response');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.eventType).toBe('npc_dialogue');
      }
    });

    it('should map environment_reaction to environment event type', async () => {
      const result = await pipeline.generate('game-123', 'environment_reaction');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.eventType).toBe('environment');
      }
    });

    it('should map dm_continuation to narration event type', async () => {
      const result = await pipeline.generate('game-123', 'dm_continuation');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.eventType).toBe('narration');
      }
    });
  });

  describe('metadata extraction', () => {
    it('should extract speaker from NPC response', async () => {
      (mockAIProvider.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: {
          content: 'Old Wizard: "Ah, young adventurers. I have been expecting you."',
          durationMs: 500,
        },
      });

      const contextWithNPCs = {
        ...mockContext,
        type: 'npc_response' as const,
        npcsPresent: [
          {
            id: 'npc-1',
            name: 'Old Wizard',
            description: 'A wise old wizard',
            currentAreaId: 'area-1',
            disposition: 'friendly' as const,
            tags: [],
          },
        ],
      };
      (mockContextBuilder.build as ReturnType<typeof vi.fn>).mockResolvedValue(
        contextWithNPCs
      );

      const result = await pipeline.generate('game-123', 'npc_response');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.speaker).toBe('Old Wizard');
      }
    });

    it('should extract suggested actions', async () => {
      (mockAIProvider.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: {
          content: `The door creaks open, revealing a dark corridor.
* Investigate the corridor
* Go back to the main hall
* Light a torch`,
          durationMs: 500,
        },
      });

      const result = await pipeline.generate('game-123', 'narration');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.suggestedActions).toEqual([
          'Investigate the corridor',
          'Go back to the main hall',
          'Light a torch',
        ]);
      }
    });
  });

  describe('content cleaning', () => {
    it('should remove suggested actions from content', async () => {
      (mockAIProvider.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: {
          content: `The door creaks open.
* Go forward`,
          durationMs: 500,
        },
      });

      const result = await pipeline.generate('game-123', 'narration');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('The door creaks open.');
      }
    });
  });
});
