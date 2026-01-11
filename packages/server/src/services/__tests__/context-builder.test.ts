import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CanonicalEvent, GameState, Character, NPC } from '@reckoning/shared';
import {
  DefaultContextBuilder,
  type GameRepository,
  type EventRepository,
  type AreaRepository,
  type AreaWithDetails,
  type PartyRepository,
} from '../ai/context-builder.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const mockGameState: GameState = {
  id: 'game-123',
  playerId: 'player-456',
  currentAreaId: 'tavern_common',
  turn: 5,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T01:00:00Z',
};

const mockArea: AreaWithDetails = {
  id: 'tavern_common',
  name: 'The Wayward Rest - Common Room',
  description: 'A warm and inviting tavern common room.',
  tags: ['tavern', 'indoor'],
  exits: [
    {
      direction: 'north',
      targetAreaId: 'tavern_stairs',
      description: 'A staircase leading up.',
      locked: false,
    },
  ],
  objects: [
    {
      id: 'hearth_01',
      name: 'Stone Hearth',
      description: 'A roaring fire.',
      interactable: true,
      tags: ['fire'],
    },
  ],
  npcs: [
    {
      id: 'maren_01',
      name: 'Maren',
      description: 'The bartender.',
      currentAreaId: 'tavern_common',
      disposition: 'friendly',
      tags: ['bartender'],
    },
  ],
};

const mockPartyMembers: Character[] = [
  {
    id: 'char-001',
    name: 'Theron',
    description: 'A brave warrior.',
    class: 'Fighter',
    stats: { health: 100, maxHealth: 100 },
  },
];

const mockEvents: CanonicalEvent[] = [
  {
    id: 'event-001',
    gameId: 'game-123',
    turn: 4,
    timestamp: '2024-01-01T00:50:00Z',
    eventType: 'narration',
    content: 'The party enters the tavern.',
    locationId: 'tavern_common',
    witnesses: [],
  },
  {
    id: 'event-002',
    gameId: 'game-123',
    turn: 5,
    timestamp: '2024-01-01T00:55:00Z',
    eventType: 'npc_dialogue',
    content: 'Welcome to The Wayward Rest!',
    speaker: 'Maren',
    locationId: 'tavern_common',
    witnesses: ['maren_01'],
  },
];

// =============================================================================
// Mock Repositories
// =============================================================================

function createMockGameRepo(game?: GameState): GameRepository {
  return {
    findById: vi.fn().mockReturnValue(game),
  };
}

function createMockEventRepo(events: CanonicalEvent[] = []): EventRepository {
  return {
    getRecentContext: vi.fn().mockReturnValue(events),
  };
}

function createMockAreaRepo(area?: AreaWithDetails): AreaRepository {
  return {
    getWithDetails: vi.fn().mockReturnValue(area),
  };
}

function createMockPartyRepo(members: Character[] = []): PartyRepository {
  return {
    findByGame: vi.fn().mockReturnValue(members),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('DefaultContextBuilder', () => {
  let gameRepo: GameRepository;
  let eventRepo: EventRepository;
  let areaRepo: AreaRepository;
  let partyRepo: PartyRepository;
  let builder: DefaultContextBuilder;

  beforeEach(() => {
    gameRepo = createMockGameRepo(mockGameState);
    eventRepo = createMockEventRepo(mockEvents);
    areaRepo = createMockAreaRepo(mockArea);
    partyRepo = createMockPartyRepo(mockPartyMembers);
    builder = new DefaultContextBuilder(gameRepo, eventRepo, areaRepo, partyRepo);
  });

  describe('build', () => {
    it('should fetch game state from GameRepository', async () => {
      await builder.build('game-123', 'narration');

      expect(gameRepo.findById).toHaveBeenCalledWith('game-123');
    });

    it('should throw error when game not found', async () => {
      gameRepo = createMockGameRepo(undefined);
      builder = new DefaultContextBuilder(gameRepo, eventRepo, areaRepo, partyRepo);

      await expect(builder.build('nonexistent', 'narration')).rejects.toThrow(
        'Game not found: nonexistent'
      );
    });

    it('should fetch area with details from AreaRepository', async () => {
      await builder.build('game-123', 'narration');

      expect(areaRepo.getWithDetails).toHaveBeenCalledWith('tavern_common');
    });

    it('should throw error when area not found', async () => {
      areaRepo = createMockAreaRepo(undefined);
      builder = new DefaultContextBuilder(gameRepo, eventRepo, areaRepo, partyRepo);

      await expect(builder.build('game-123', 'narration')).rejects.toThrow(
        'Area not found: tavern_common'
      );
    });

    it('should fetch party members from PartyRepository', async () => {
      await builder.build('game-123', 'narration');

      expect(partyRepo.findByGame).toHaveBeenCalledWith('game-123');
    });

    it('should fetch recent history from EventRepository', async () => {
      await builder.build('game-123', 'narration');

      expect(eventRepo.getRecentContext).toHaveBeenCalledWith('game-123');
    });

    it('should return complete GenerationContext', async () => {
      const context = await builder.build('game-123', 'narration');

      expect(context.type).toBe('narration');
      expect(context.gameState).toEqual(mockGameState);
      expect(context.currentArea).toEqual(mockArea);
      expect(context.party).toEqual(mockPartyMembers);
      expect(context.npcsPresent).toEqual(mockArea.npcs);
    });

    it('should format recentHistory as strings', async () => {
      const context = await builder.build('game-123', 'narration');

      expect(context.recentHistory).toHaveLength(2);
      expect(context.recentHistory[0]).toBe(
        '[narration] The party enters the tavern.'
      );
      expect(context.recentHistory[1]).toBe(
        '[npc_dialogue] Maren: Welcome to The Wayward Rest!'
      );
    });

    it('should include dmGuidance when provided', async () => {
      const context = await builder.build('game-123', 'narration', {
        dmGuidance: 'Keep the tone mysterious.',
      });

      expect(context.dmGuidance).toBe('Keep the tone mysterious.');
    });

    it('should handle empty party', async () => {
      partyRepo = createMockPartyRepo([]);
      builder = new DefaultContextBuilder(gameRepo, eventRepo, areaRepo, partyRepo);

      const context = await builder.build('game-123', 'narration');

      expect(context.party).toEqual([]);
    });

    it('should handle empty event history', async () => {
      eventRepo = createMockEventRepo([]);
      builder = new DefaultContextBuilder(gameRepo, eventRepo, areaRepo, partyRepo);

      const context = await builder.build('game-123', 'narration');

      expect(context.recentHistory).toEqual([]);
    });

    it('should pass through all generation types', async () => {
      const types = [
        'narration',
        'npc_response',
        'environment_reaction',
        'dm_continuation',
      ] as const;

      for (const type of types) {
        const context = await builder.build('game-123', type);
        expect(context.type).toBe(type);
      }
    });
  });

  describe('summarizeHistory', () => {
    it('should return undefined by default (no summarization)', () => {
      const result = builder.summarizeHistory?.(mockEvents);

      expect(result).toBeUndefined();
    });

    it('should allow extension via override', async () => {
      class SummarizingBuilder extends DefaultContextBuilder {
        summarizeHistory(events: CanonicalEvent[]): string {
          return `Summary of ${events.length} events`;
        }
      }

      const summarizingBuilder = new SummarizingBuilder(
        gameRepo,
        eventRepo,
        areaRepo,
        partyRepo
      );

      const context = await summarizingBuilder.build('game-123', 'narration');

      expect(context.historyContext).toBe('Summary of 2 events');
    });
  });
});
