import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ContextBuilder, ExtendedGenerationContext } from '../../ai/context-builder.js';
import type { AIProvider, AIResponse, AIError } from '../../ai/types.js';
import type { EvolutionService } from '../../evolution/index.js';
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

  describe('evolution detection', () => {
    let mockEvolutionService: EvolutionService;

    beforeEach(() => {
      mockEvolutionService = {
        detectEvolutions: vi.fn().mockReturnValue([]),
        approve: vi.fn(),
        edit: vi.fn(),
        refuse: vi.fn(),
        getEntitySummary: vi.fn(),
        computeAggregateLabel: vi.fn(),
        getPendingEvolutions: vi.fn(),
      } as unknown as EvolutionService;
    });

    it('should call detectEvolutions when evolution service is configured and evolutions are present', async () => {
      const pipelineWithEvolution = new ContentPipeline({
        contextBuilder: mockContextBuilder,
        aiProvider: mockAIProvider,
        evolutionService: mockEvolutionService,
      });

      const responseWithEvolutions = JSON.stringify({
        eventType: 'narration',
        content: 'The guard captain nods with respect.',
        evolutions: [
          {
            evolutionType: 'trait_add',
            entityType: 'player',
            entityId: 'player-1',
            trait: 'respected',
            reason: 'Earned the respect of the guard captain through honorable actions',
          },
        ],
      });

      (mockAIProvider.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: {
          content: responseWithEvolutions,
          durationMs: 500,
        },
      });

      await pipelineWithEvolution.generate('game-123', 'narration');

      expect(mockEvolutionService.detectEvolutions).toHaveBeenCalledWith(
        'game-123',
        expect.objectContaining({
          turn: 1,
          gameId: 'game-123',
        }),
        expect.arrayContaining([
          expect.objectContaining({
            evolutionType: 'trait_add',
            entityType: 'player',
            entityId: 'player-1',
            trait: 'respected',
          }),
        ])
      );
    });

    it('should handle relationship_change evolutions', async () => {
      const pipelineWithEvolution = new ContentPipeline({
        contextBuilder: mockContextBuilder,
        aiProvider: mockAIProvider,
        evolutionService: mockEvolutionService,
      });

      const responseWithRelationship = JSON.stringify({
        eventType: 'narration',
        content: 'The merchant seems pleased with your fair dealings.',
        evolutions: [
          {
            evolutionType: 'relationship_change',
            entityType: 'npc',
            entityId: 'merchant-1',
            targetType: 'player',
            targetId: 'player-1',
            dimension: 'trust',
            change: 0.1,
            reason: 'Player paid fair price without haggling',
          },
        ],
      });

      (mockAIProvider.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: {
          content: responseWithRelationship,
          durationMs: 500,
        },
      });

      await pipelineWithEvolution.generate('game-123', 'narration');

      expect(mockEvolutionService.detectEvolutions).toHaveBeenCalledWith(
        'game-123',
        expect.any(Object),
        expect.arrayContaining([
          expect.objectContaining({
            evolutionType: 'relationship_change',
            dimension: 'trust',
            change: 0.1,
          }),
        ])
      );
    });

    it('should not call detectEvolutions when no evolution service is configured', async () => {
      const responseWithEvolutions = JSON.stringify({
        eventType: 'narration',
        content: 'Test content',
        evolutions: [
          {
            evolutionType: 'trait_add',
            entityType: 'player',
            entityId: 'player-1',
            trait: 'brave',
            reason: 'Test reason',
          },
        ],
      });

      (mockAIProvider.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: {
          content: responseWithEvolutions,
          durationMs: 500,
        },
      });

      // Using pipeline without evolution service (from outer beforeEach)
      await pipeline.generate('game-123', 'narration');

      expect(mockEvolutionService.detectEvolutions).not.toHaveBeenCalled();
    });

    it('should not call detectEvolutions when no evolutions in response', async () => {
      const pipelineWithEvolution = new ContentPipeline({
        contextBuilder: mockContextBuilder,
        aiProvider: mockAIProvider,
        evolutionService: mockEvolutionService,
      });

      const responseWithoutEvolutions = JSON.stringify({
        eventType: 'narration',
        content: 'Just a simple narration with no evolutions.',
      });

      (mockAIProvider.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: {
          content: responseWithoutEvolutions,
          durationMs: 500,
        },
      });

      await pipelineWithEvolution.generate('game-123', 'narration');

      expect(mockEvolutionService.detectEvolutions).not.toHaveBeenCalled();
    });

    it('should handle multiple evolution suggestions', async () => {
      const pipelineWithEvolution = new ContentPipeline({
        contextBuilder: mockContextBuilder,
        aiProvider: mockAIProvider,
        evolutionService: mockEvolutionService,
      });

      const responseWithMultipleEvolutions = JSON.stringify({
        eventType: 'narration',
        content: 'An epic battle concludes.',
        evolutions: [
          {
            evolutionType: 'trait_add',
            entityType: 'player',
            entityId: 'player-1',
            trait: 'battle-hardened',
            reason: 'Survived a fierce battle',
          },
          {
            evolutionType: 'trait_add',
            entityType: 'npc',
            entityId: 'ally-1',
            trait: 'loyal',
            reason: 'Fought alongside the player',
          },
          {
            evolutionType: 'relationship_change',
            entityType: 'player',
            entityId: 'player-1',
            targetType: 'npc',
            targetId: 'ally-1',
            dimension: 'trust',
            change: 0.2,
            reason: 'Shared combat experience',
          },
        ],
      });

      (mockAIProvider.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: {
          content: responseWithMultipleEvolutions,
          durationMs: 500,
        },
      });

      await pipelineWithEvolution.generate('game-123', 'narration');

      expect(mockEvolutionService.detectEvolutions).toHaveBeenCalledWith(
        'game-123',
        expect.any(Object),
        expect.arrayContaining([
          expect.objectContaining({ trait: 'battle-hardened' }),
          expect.objectContaining({ trait: 'loyal' }),
          expect.objectContaining({ dimension: 'trust', change: 0.2 }),
        ])
      );

      const callArgs = (mockEvolutionService.detectEvolutions as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[2]).toHaveLength(3);
    });

    it('should still return content when evolution detection is configured', async () => {
      const pipelineWithEvolution = new ContentPipeline({
        contextBuilder: mockContextBuilder,
        aiProvider: mockAIProvider,
        evolutionService: mockEvolutionService,
      });

      const response = JSON.stringify({
        eventType: 'narration',
        content: 'The story continues.',
        evolutions: [
          {
            evolutionType: 'trait_add',
            entityType: 'player',
            entityId: 'player-1',
            trait: 'wise',
            reason: 'Learned from experience',
          },
        ],
      });

      (mockAIProvider.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: {
          content: response,
          durationMs: 500,
        },
      });

      const result = await pipelineWithEvolution.generate('game-123', 'narration');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('The story continues.');
        expect(result.value.eventType).toBe('narration');
      }
    });
  });
});
