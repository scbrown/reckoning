import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CanonicalEvent, GameState, NPC } from '@reckoning/shared';
import {
  DefaultContextBuilder,
  type GameRepository,
  type EventRepository,
  type AreaRepository,
  type AreaWithDetails,
  type PartyRepository,
  type CharacterWithRole,
  buildPartyContext,
  getHealthStatus,
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

const mockPartyMembers: CharacterWithRole[] = [
  {
    id: 'char-001',
    name: 'Theron',
    description: 'A brave warrior.',
    class: 'Fighter',
    role: 'player',
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

function createMockPartyRepo(members: CharacterWithRole[] = []): PartyRepository {
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

  describe('formattedPartyContext', () => {
    it('should include formattedPartyContext in returned context', async () => {
      const context = await builder.build('game-123', 'narration');

      expect(context.formattedPartyContext).toBe('Party: Theron (Fighter) [Healthy] (Player Character)');
    });

    it('should show empty party message when no party members', async () => {
      partyRepo = createMockPartyRepo([]);
      builder = new DefaultContextBuilder(gameRepo, eventRepo, areaRepo, partyRepo);

      const context = await builder.build('game-123', 'narration');

      expect(context.formattedPartyContext).toBe('Party: (empty)');
    });
  });
});

describe('getHealthStatus', () => {
  it('should return Healthy for health > 70%', () => {
    expect(getHealthStatus(100, 100)).toBe('Healthy');
    expect(getHealthStatus(80, 100)).toBe('Healthy');
    expect(getHealthStatus(71, 100)).toBe('Healthy');
  });

  it('should return Wounded for health > 30% and <= 70%', () => {
    expect(getHealthStatus(70, 100)).toBe('Wounded');
    expect(getHealthStatus(50, 100)).toBe('Wounded');
    expect(getHealthStatus(31, 100)).toBe('Wounded');
  });

  it('should return Critical for health <= 30%', () => {
    expect(getHealthStatus(30, 100)).toBe('Critical');
    expect(getHealthStatus(15, 100)).toBe('Critical');
    expect(getHealthStatus(0, 100)).toBe('Critical');
  });

  it('should return Healthy for zero maxHealth (edge case)', () => {
    expect(getHealthStatus(0, 0)).toBe('Healthy');
  });
});

describe('buildPartyContext', () => {
  it('should format party with health status and player marker', () => {
    const party: CharacterWithRole[] = [
      {
        id: 'char-001',
        name: 'Theron',
        description: 'A warrior',
        class: 'Fighter',
        role: 'player',
        stats: { health: 100, maxHealth: 100 },
      },
      {
        id: 'char-002',
        name: 'Lyra',
        description: 'A mage',
        class: 'Wizard',
        role: 'member',
        stats: { health: 50, maxHealth: 100 },
      },
    ];

    const result = buildPartyContext(party);

    expect(result).toBe('Party: Theron (Fighter) [Healthy] (Player Character), Lyra (Wizard) [Wounded]');
  });

  it('should mark only the player character', () => {
    const party: CharacterWithRole[] = [
      {
        id: 'char-001',
        name: 'Theron',
        description: 'A warrior',
        class: 'Fighter',
        role: 'player',
        stats: { health: 100, maxHealth: 100 },
      },
      {
        id: 'char-002',
        name: 'Wolf',
        description: 'A wolf companion',
        class: 'Beast',
        role: 'companion',
        stats: { health: 80, maxHealth: 100 },
      },
    ];

    const result = buildPartyContext(party);

    expect(result).toContain('(Player Character)');
    expect(result.match(/\(Player Character\)/g)?.length).toBe(1);
  });

  it('should return empty message for empty party', () => {
    const result = buildPartyContext([]);

    expect(result).toBe('Party: (empty)');
  });

  it('should show Critical for low health characters', () => {
    const party: CharacterWithRole[] = [
      {
        id: 'char-001',
        name: 'Theron',
        description: 'A warrior',
        class: 'Fighter',
        role: 'player',
        stats: { health: 20, maxHealth: 100 },
      },
    ];

    const result = buildPartyContext(party);

    expect(result).toBe('Party: Theron (Fighter) [Critical] (Player Character)');
  });
});

// =============================================================================
// Player Behavior Context Tests
// =============================================================================

import {
  ratioToPercent,
  patternsToContext,
  formatPlayerBehavior,
  type PatternRepository,
  type PlayerBehaviorContext,
} from '../ai/context-builder.js';
import type { PlayerPatterns } from '../chronicle/types.js';

describe('ratioToPercent', () => {
  it('should convert ratio of 1 to 100%', () => {
    expect(ratioToPercent(1)).toBe(100);
  });

  it('should convert ratio of -1 to 0%', () => {
    expect(ratioToPercent(-1)).toBe(0);
  });

  it('should convert ratio of 0 to 50%', () => {
    expect(ratioToPercent(0)).toBe(50);
  });

  it('should convert positive ratios correctly', () => {
    expect(ratioToPercent(0.5)).toBe(75);
    expect(ratioToPercent(0.46)).toBe(73); // (0.46 + 1) * 50 = 73
  });

  it('should convert negative ratios correctly', () => {
    expect(ratioToPercent(-0.5)).toBe(25);
    expect(ratioToPercent(-0.1)).toBe(45);
  });
});

describe('patternsToContext', () => {
  const createMockPatterns = (overrides: Partial<PlayerPatterns> = {}): PlayerPatterns => ({
    playerId: 'player-1',
    gameId: 'game-1',
    totalEvents: 10,
    categoryCounts: { mercy: 5, violence: 2, honesty: 3, social: 4, exploration: 2, character: 1 },
    ratios: {
      mercyVsViolence: 0.46,
      honestyVsDeception: -0.1,
      helpfulVsHarmful: 0.2,
    },
    violenceInitiation: {
      initiatesViolence: false,
      initiationRatio: 0.2,
      totalViolenceEvents: 5,
      attackFirstEvents: 1,
    },
    socialApproach: 'diplomatic',
    dominantTraits: ['merciful', 'cunning'],
    ...overrides,
  });

  it('should convert patterns to context with correct percentages', () => {
    const patterns = createMockPatterns();
    const context = patternsToContext(patterns);

    expect(context.mercyPercent).toBe(73); // (0.46 + 1) * 50 = 73
    expect(context.honestyPercent).toBe(45); // (-0.1 + 1) * 50 = 45
    expect(context.socialApproach).toBe('diplomatic');
    expect(context.dominantTraits).toEqual(['merciful', 'cunning']);
    expect(context.hasEnoughData).toBe(true);
  });

  it('should mark hasEnoughData as false when totalEvents < 5', () => {
    const patterns = createMockPatterns({ totalEvents: 3 });
    const context = patternsToContext(patterns);

    expect(context.hasEnoughData).toBe(false);
  });

  it('should mark hasEnoughData as true when totalEvents >= 5', () => {
    const patterns = createMockPatterns({ totalEvents: 5 });
    const context = patternsToContext(patterns);

    expect(context.hasEnoughData).toBe(true);
  });
});

describe('formatPlayerBehavior', () => {
  it('should return undefined when hasEnoughData is false', () => {
    const behavior: PlayerBehaviorContext = {
      mercyPercent: 73,
      honestyPercent: 45,
      socialApproach: 'diplomatic',
      dominantTraits: ['merciful'],
      hasEnoughData: false,
    };

    expect(formatPlayerBehavior(behavior)).toBeUndefined();
  });

  it('should format behavior with all fields', () => {
    const behavior: PlayerBehaviorContext = {
      mercyPercent: 73,
      honestyPercent: 45,
      socialApproach: 'diplomatic',
      dominantTraits: ['merciful', 'cunning'],
      hasEnoughData: true,
    };

    const result = formatPlayerBehavior(behavior);

    expect(result).toContain('Player behavioral patterns:');
    expect(result).toContain('Shows mercy: 73%');
    expect(result).toContain('tends toward mercy');
    expect(result).toContain('Honesty: 45%');
    expect(result).toContain('balanced');
    expect(result).toContain('Social approach: diplomatic');
    expect(result).toContain('Inferred traits: merciful, cunning');
  });

  it('should not include social approach when minimal', () => {
    const behavior: PlayerBehaviorContext = {
      mercyPercent: 50,
      honestyPercent: 50,
      socialApproach: 'minimal',
      dominantTraits: [],
      hasEnoughData: true,
    };

    const result = formatPlayerBehavior(behavior);

    expect(result).not.toContain('Social approach');
  });

  it('should not include traits when empty', () => {
    const behavior: PlayerBehaviorContext = {
      mercyPercent: 50,
      honestyPercent: 50,
      socialApproach: 'balanced',
      dominantTraits: [],
      hasEnoughData: true,
    };

    const result = formatPlayerBehavior(behavior);

    expect(result).not.toContain('Inferred traits');
  });

  it('should describe extreme mercy correctly', () => {
    const behavior: PlayerBehaviorContext = {
      mercyPercent: 95,
      honestyPercent: 50,
      socialApproach: 'balanced',
      dominantTraits: [],
      hasEnoughData: true,
    };

    const result = formatPlayerBehavior(behavior);
    expect(result).toContain('tends toward mercy');
  });

  it('should describe extreme violence correctly', () => {
    const behavior: PlayerBehaviorContext = {
      mercyPercent: 15,
      honestyPercent: 50,
      socialApproach: 'balanced',
      dominantTraits: [],
      hasEnoughData: true,
    };

    const result = formatPlayerBehavior(behavior);
    expect(result).toContain('tends toward violence');
  });
});

describe('DefaultContextBuilder with PatternRepository', () => {
  function createMockPatternRepo(patterns: PlayerPatterns): PatternRepository {
    return {
      getPlayerPatterns: vi.fn().mockReturnValue(patterns),
    };
  }

  const mockPatterns: PlayerPatterns = {
    playerId: 'char-001',
    gameId: 'game-123',
    totalEvents: 20,
    categoryCounts: { mercy: 10, violence: 5, honesty: 3, social: 4, exploration: 2, character: 1 },
    ratios: {
      mercyVsViolence: 0.46,
      honestyVsDeception: 0.2,
      helpfulVsHarmful: 0.3,
    },
    violenceInitiation: {
      initiatesViolence: false,
      initiationRatio: 0.1,
      totalViolenceEvents: 5,
      attackFirstEvents: 0,
    },
    socialApproach: 'diplomatic',
    dominantTraits: ['merciful', 'charismatic'],
  };

  it('should include playerBehavior when PatternRepository is provided', async () => {
    const gameRepo = createMockGameRepo(mockGameState);
    const eventRepo = createMockEventRepo(mockEvents);
    const areaRepo = createMockAreaRepo(mockArea);
    const partyRepo = createMockPartyRepo(mockPartyMembers);
    const patternRepo = createMockPatternRepo(mockPatterns);

    const builder = new DefaultContextBuilder(
      gameRepo,
      eventRepo,
      areaRepo,
      partyRepo,
      undefined,
      patternRepo
    );

    const context = await builder.build('game-123', 'narration');

    expect(patternRepo.getPlayerPatterns).toHaveBeenCalledWith('game-123', 'char-001');
    expect(context.playerBehavior).toBeDefined();
    expect(context.playerBehavior?.mercyPercent).toBe(73);
    expect(context.playerBehavior?.socialApproach).toBe('diplomatic');
  });

  it('should include formattedPlayerBehavior when enough data', async () => {
    const gameRepo = createMockGameRepo(mockGameState);
    const eventRepo = createMockEventRepo(mockEvents);
    const areaRepo = createMockAreaRepo(mockArea);
    const partyRepo = createMockPartyRepo(mockPartyMembers);
    const patternRepo = createMockPatternRepo(mockPatterns);

    const builder = new DefaultContextBuilder(
      gameRepo,
      eventRepo,
      areaRepo,
      partyRepo,
      undefined,
      patternRepo
    );

    const context = await builder.build('game-123', 'narration');

    expect(context.formattedPlayerBehavior).toBeDefined();
    expect(context.formattedPlayerBehavior).toContain('Player behavioral patterns:');
    expect(context.formattedPlayerBehavior).toContain('Shows mercy: 73%');
  });

  it('should not include formattedPlayerBehavior when insufficient data', async () => {
    const insufficientPatterns = { ...mockPatterns, totalEvents: 2 };
    const gameRepo = createMockGameRepo(mockGameState);
    const eventRepo = createMockEventRepo(mockEvents);
    const areaRepo = createMockAreaRepo(mockArea);
    const partyRepo = createMockPartyRepo(mockPartyMembers);
    const patternRepo = createMockPatternRepo(insufficientPatterns);

    const builder = new DefaultContextBuilder(
      gameRepo,
      eventRepo,
      areaRepo,
      partyRepo,
      undefined,
      patternRepo
    );

    const context = await builder.build('game-123', 'narration');

    expect(context.playerBehavior?.hasEnoughData).toBe(false);
    expect(context.formattedPlayerBehavior).toBeUndefined();
  });

  it('should not call patternRepo when no player in party', async () => {
    const nonPlayerParty: CharacterWithRole[] = [
      {
        id: 'char-002',
        name: 'Wolf',
        description: 'A companion',
        class: 'Beast',
        role: 'companion',
        stats: { health: 100, maxHealth: 100 },
      },
    ];

    const gameRepo = createMockGameRepo(mockGameState);
    const eventRepo = createMockEventRepo(mockEvents);
    const areaRepo = createMockAreaRepo(mockArea);
    const partyRepo = createMockPartyRepo(nonPlayerParty);
    const patternRepo = createMockPatternRepo(mockPatterns);

    const builder = new DefaultContextBuilder(
      gameRepo,
      eventRepo,
      areaRepo,
      partyRepo,
      undefined,
      patternRepo
    );

    const context = await builder.build('game-123', 'narration');

    expect(patternRepo.getPlayerPatterns).not.toHaveBeenCalled();
    expect(context.playerBehavior).toBeUndefined();
  });

  it('should not include playerBehavior when PatternRepository is not provided', async () => {
    const gameRepo = createMockGameRepo(mockGameState);
    const eventRepo = createMockEventRepo(mockEvents);
    const areaRepo = createMockAreaRepo(mockArea);
    const partyRepo = createMockPartyRepo(mockPartyMembers);

    const builder = new DefaultContextBuilder(
      gameRepo,
      eventRepo,
      areaRepo,
      partyRepo
    );

    const context = await builder.build('game-123', 'narration');

    expect(context.playerBehavior).toBeUndefined();
    expect(context.formattedPlayerBehavior).toBeUndefined();
  });
});

// =============================================================================
// Scene Context Tests
// =============================================================================

import {
  formatSceneContext,
  type SceneContext,
  type SceneRepository,
  type GameRepositoryWithScene,
} from '../ai/context-builder.js';
import type { Scene } from '../../db/repositories/scene-repository.js';

describe('formatSceneContext', () => {
  it('should format current scene with all details', () => {
    const sceneContext: SceneContext = {
      currentScene: {
        name: 'The Dark Forest',
        sceneType: 'exploration',
        mood: 'tense',
        stakes: 'medium',
        turnCount: 5,
        status: 'active',
      },
      availableScenes: [],
      recentScenes: [],
    };

    const result = formatSceneContext(sceneContext);

    expect(result).toContain('Current scene: "The Dark Forest" (exploration) - Mood: tense, Stakes: medium');
    expect(result).toContain('Scene progress: Turn 5 of current scene');
  });

  it('should show no active scene when currentScene is null', () => {
    const sceneContext: SceneContext = {
      currentScene: null,
      availableScenes: [],
      recentScenes: [],
    };

    const result = formatSceneContext(sceneContext);

    expect(result).toContain('Current scene: None (between scenes)');
  });

  it('should format available transitions', () => {
    const sceneContext: SceneContext = {
      currentScene: null,
      availableScenes: [
        { id: 'scene-1', name: 'Town Square', sceneType: 'social' },
        { id: 'scene-2', name: 'Cave Entrance', sceneType: 'combat' },
      ],
      recentScenes: [],
    };

    const result = formatSceneContext(sceneContext);

    expect(result).toContain('Available transitions: "Town Square" (social), "Cave Entrance" (combat)');
  });

  it('should format recent scene history', () => {
    const sceneContext: SceneContext = {
      currentScene: null,
      availableScenes: [],
      recentScenes: [
        { name: 'Village Inn', sceneType: 'social', status: 'completed' },
        { name: 'Road Ambush', sceneType: 'combat', status: 'completed' },
      ],
    };

    const result = formatSceneContext(sceneContext);

    expect(result).toContain('Recent scenes: "Village Inn" (social), completed; "Road Ambush" (combat), completed');
  });

  it('should handle scene with only mood', () => {
    const sceneContext: SceneContext = {
      currentScene: {
        name: 'Misty Valley',
        sceneType: 'exploration',
        mood: 'mysterious',
        stakes: null,
        turnCount: 2,
        status: 'active',
      },
      availableScenes: [],
      recentScenes: [],
    };

    const result = formatSceneContext(sceneContext);

    expect(result).toContain('Current scene: "Misty Valley" (exploration) - Mood: mysterious');
    expect(result).not.toContain('Stakes:');
  });

  it('should handle scene with only stakes', () => {
    const sceneContext: SceneContext = {
      currentScene: {
        name: 'Final Battle',
        sceneType: 'combat',
        mood: null,
        stakes: 'high',
        turnCount: 1,
        status: 'active',
      },
      availableScenes: [],
      recentScenes: [],
    };

    const result = formatSceneContext(sceneContext);

    expect(result).toContain('Current scene: "Final Battle" (combat) - Stakes: high');
    expect(result).not.toContain('Mood:');
  });

  it('should handle scene with null name', () => {
    const sceneContext: SceneContext = {
      currentScene: {
        name: null,
        sceneType: 'exploration',
        mood: null,
        stakes: null,
        turnCount: 3,
        status: 'active',
      },
      availableScenes: [],
      recentScenes: [],
    };

    const result = formatSceneContext(sceneContext);

    expect(result).toContain('Current scene: "Unnamed Scene" (exploration)');
  });

  it('should handle scene without type', () => {
    const sceneContext: SceneContext = {
      currentScene: {
        name: 'Random Event',
        sceneType: null,
        mood: 'neutral',
        stakes: null,
        turnCount: 1,
        status: 'active',
      },
      availableScenes: [],
      recentScenes: [],
    };

    const result = formatSceneContext(sceneContext);

    expect(result).toContain('Current scene: "Random Event" - Mood: neutral');
    expect(result).not.toContain('()');
  });
});

describe('DefaultContextBuilder with SceneRepository', () => {
  const mockScene: Scene = {
    id: 'scene-001',
    gameId: 'game-123',
    name: 'The Tavern Brawl',
    description: 'A fight breaks out in the tavern',
    sceneType: 'combat',
    locationId: 'tavern_common',
    startedTurn: 3,
    completedTurn: null,
    status: 'active',
    mood: 'tense',
    stakes: 'medium',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockAvailableScenes: Scene[] = [
    {
      id: 'scene-002',
      gameId: 'game-123',
      name: 'Escape Route',
      description: 'A way out of the tavern',
      sceneType: 'exploration',
      locationId: 'tavern_back',
      startedTurn: 1,
      completedTurn: null,
      status: 'active',
      mood: null,
      stakes: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  ];

  const mockAllScenes: Scene[] = [
    {
      id: 'scene-000',
      gameId: 'game-123',
      name: 'Arrival',
      description: 'Party arrives at the tavern',
      sceneType: 'social',
      locationId: 'tavern_common',
      startedTurn: 1,
      completedTurn: 2,
      status: 'completed',
      mood: 'calm',
      stakes: 'low',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    mockScene,
    ...mockAvailableScenes,
  ];

  function createMockSceneRepo(): SceneRepository {
    return {
      findById: vi.fn().mockImplementation((id: string) => {
        if (id === 'scene-001') return mockScene;
        return null;
      }),
      findByGame: vi.fn().mockReturnValue(mockAllScenes),
      findAvailable: vi.fn().mockReturnValue([mockScene, ...mockAvailableScenes]),
      countEventsInScene: vi.fn().mockReturnValue(5),
    };
  }

  function createMockGameRepoWithScene(): GameRepositoryWithScene {
    return {
      findById: vi.fn().mockReturnValue(mockGameState),
      getCurrentSceneId: vi.fn().mockReturnValue('scene-001'),
    };
  }

  it('should include sceneContext when SceneRepository is provided', async () => {
    const gameRepo = createMockGameRepo(mockGameState);
    const eventRepo = createMockEventRepo(mockEvents);
    const areaRepo = createMockAreaRepo(mockArea);
    const partyRepo = createMockPartyRepo(mockPartyMembers);
    const sceneRepo = createMockSceneRepo();
    const gameRepoWithScene = createMockGameRepoWithScene();

    const builder = new DefaultContextBuilder(
      gameRepo,
      eventRepo,
      areaRepo,
      partyRepo,
      undefined,
      undefined,
      sceneRepo,
      gameRepoWithScene
    );

    const context = await builder.build('game-123', 'narration');

    expect(gameRepoWithScene.getCurrentSceneId).toHaveBeenCalledWith('game-123');
    expect(sceneRepo.findById).toHaveBeenCalledWith('scene-001');
    expect(context.sceneContext).toBeDefined();
    expect(context.sceneContext?.currentScene).toBeDefined();
    expect(context.sceneContext?.currentScene?.name).toBe('The Tavern Brawl');
    expect(context.sceneContext?.currentScene?.sceneType).toBe('combat');
    expect(context.sceneContext?.currentScene?.mood).toBe('tense');
    expect(context.sceneContext?.currentScene?.stakes).toBe('medium');
  });

  it('should calculate turnCount correctly', async () => {
    const gameRepo = createMockGameRepo(mockGameState);
    const eventRepo = createMockEventRepo(mockEvents);
    const areaRepo = createMockAreaRepo(mockArea);
    const partyRepo = createMockPartyRepo(mockPartyMembers);
    const sceneRepo = createMockSceneRepo();
    const gameRepoWithScene = createMockGameRepoWithScene();

    const builder = new DefaultContextBuilder(
      gameRepo,
      eventRepo,
      areaRepo,
      partyRepo,
      undefined,
      undefined,
      sceneRepo,
      gameRepoWithScene
    );

    const context = await builder.build('game-123', 'narration');

    // Game is at turn 5, scene started at turn 3: 5 - 3 + 1 = 3
    expect(context.sceneContext?.currentScene?.turnCount).toBe(3);
  });

  it('should include available scenes excluding current scene', async () => {
    const gameRepo = createMockGameRepo(mockGameState);
    const eventRepo = createMockEventRepo(mockEvents);
    const areaRepo = createMockAreaRepo(mockArea);
    const partyRepo = createMockPartyRepo(mockPartyMembers);
    const sceneRepo = createMockSceneRepo();
    const gameRepoWithScene = createMockGameRepoWithScene();

    const builder = new DefaultContextBuilder(
      gameRepo,
      eventRepo,
      areaRepo,
      partyRepo,
      undefined,
      undefined,
      sceneRepo,
      gameRepoWithScene
    );

    const context = await builder.build('game-123', 'narration');

    expect(sceneRepo.findAvailable).toHaveBeenCalledWith('game-123');
    // Should not include the current scene (scene-001) in available scenes
    expect(context.sceneContext?.availableScenes.length).toBe(1);
    expect(context.sceneContext?.availableScenes[0].name).toBe('Escape Route');
  });

  it('should include recent scene history', async () => {
    const gameRepo = createMockGameRepo(mockGameState);
    const eventRepo = createMockEventRepo(mockEvents);
    const areaRepo = createMockAreaRepo(mockArea);
    const partyRepo = createMockPartyRepo(mockPartyMembers);
    const sceneRepo = createMockSceneRepo();
    const gameRepoWithScene = createMockGameRepoWithScene();

    const builder = new DefaultContextBuilder(
      gameRepo,
      eventRepo,
      areaRepo,
      partyRepo,
      undefined,
      undefined,
      sceneRepo,
      gameRepoWithScene
    );

    const context = await builder.build('game-123', 'narration');

    expect(sceneRepo.findByGame).toHaveBeenCalledWith('game-123');
    expect(context.sceneContext?.recentScenes.length).toBe(1);
    expect(context.sceneContext?.recentScenes[0].name).toBe('Arrival');
    expect(context.sceneContext?.recentScenes[0].status).toBe('completed');
  });

  it('should include formattedSceneContext', async () => {
    const gameRepo = createMockGameRepo(mockGameState);
    const eventRepo = createMockEventRepo(mockEvents);
    const areaRepo = createMockAreaRepo(mockArea);
    const partyRepo = createMockPartyRepo(mockPartyMembers);
    const sceneRepo = createMockSceneRepo();
    const gameRepoWithScene = createMockGameRepoWithScene();

    const builder = new DefaultContextBuilder(
      gameRepo,
      eventRepo,
      areaRepo,
      partyRepo,
      undefined,
      undefined,
      sceneRepo,
      gameRepoWithScene
    );

    const context = await builder.build('game-123', 'narration');

    expect(context.formattedSceneContext).toBeDefined();
    expect(context.formattedSceneContext).toContain('Current scene: "The Tavern Brawl" (combat)');
    expect(context.formattedSceneContext).toContain('Mood: tense');
    expect(context.formattedSceneContext).toContain('Stakes: medium');
  });

  it('should handle no current scene gracefully', async () => {
    const gameRepo = createMockGameRepo(mockGameState);
    const eventRepo = createMockEventRepo(mockEvents);
    const areaRepo = createMockAreaRepo(mockArea);
    const partyRepo = createMockPartyRepo(mockPartyMembers);
    const sceneRepo = createMockSceneRepo();
    const gameRepoWithScene: GameRepositoryWithScene = {
      findById: vi.fn().mockReturnValue(mockGameState),
      getCurrentSceneId: vi.fn().mockReturnValue(null),
    };

    const builder = new DefaultContextBuilder(
      gameRepo,
      eventRepo,
      areaRepo,
      partyRepo,
      undefined,
      undefined,
      sceneRepo,
      gameRepoWithScene
    );

    const context = await builder.build('game-123', 'narration');

    expect(context.sceneContext?.currentScene).toBeNull();
    expect(context.formattedSceneContext).toContain('Current scene: None (between scenes)');
  });

  it('should not include sceneContext when SceneRepository is not provided', async () => {
    const gameRepo = createMockGameRepo(mockGameState);
    const eventRepo = createMockEventRepo(mockEvents);
    const areaRepo = createMockAreaRepo(mockArea);
    const partyRepo = createMockPartyRepo(mockPartyMembers);

    const builder = new DefaultContextBuilder(
      gameRepo,
      eventRepo,
      areaRepo,
      partyRepo
    );

    const context = await builder.build('game-123', 'narration');

    expect(context.sceneContext).toBeUndefined();
    expect(context.formattedSceneContext).toBeUndefined();
  });
});
