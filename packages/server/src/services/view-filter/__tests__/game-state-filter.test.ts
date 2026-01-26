import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GameStateFilterService } from '../game-state-filter.js';
import type { FullGameState, PartyViewState, PlayerViewState } from '../types.js';
import type { Character, GameState, Area, NPC, Party } from '@reckoning/shared';
import type { EntityTrait, Relationship } from '../../../db/repositories/index.js';
import type { Scene } from '../../../db/repositories/scene-repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('GameStateFilterService', () => {
  let db: Database.Database;
  let service: GameStateFilterService;

  // Test data
  const gameId = 'test-game-1';
  const characterId = 'char-1';

  const mockGameState: GameState = {
    id: gameId,
    playerId: 'player-1',
    currentAreaId: 'area-1',
    turn: 10,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const mockCharacters: Character[] = [
    {
      id: characterId,
      name: 'Hero',
      description: 'The main character',
      class: 'Warrior',
      stats: { health: 100, maxHealth: 100 },
      pixelArtRef: { path: 'characters/hero.pxl', spriteName: 'idle' },
    },
    {
      id: 'char-2',
      name: 'Companion',
      description: 'A helpful ally',
      class: 'Mage',
      stats: { health: 80, maxHealth: 80 },
    },
  ];

  const mockParty: Party = {
    id: 'party-1',
    gameId,
    members: mockCharacters,
  };

  const mockArea: Area = {
    id: 'area-1',
    name: 'Town Square',
    description: 'A bustling market square',
    exits: [],
    objects: [],
    npcs: [],
    tags: ['town', 'outdoor'],
  };

  const mockNPCs: NPC[] = [
    {
      id: 'npc-1',
      name: 'Merchant',
      description: 'A friendly shopkeeper',
      currentAreaId: 'area-1',
      disposition: 'friendly',
      tags: ['merchant'],
    },
  ];

  const mockTraits: EntityTrait[] = [
    {
      id: 'trait-1',
      gameId,
      entityType: 'character',
      entityId: characterId,
      trait: 'brave',
      acquiredTurn: 5,
      status: 'active',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'trait-2',
      gameId,
      entityType: 'character',
      entityId: characterId,
      trait: 'legendary',
      acquiredTurn: 8,
      status: 'active',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'trait-3',
      gameId,
      entityType: 'character',
      entityId: 'char-2',
      trait: 'mysterious',
      acquiredTurn: 3,
      status: 'active',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
  ];

  const mockRelationships: Relationship[] = [
    {
      id: 'rel-1',
      gameId,
      from: { type: 'character', id: characterId },
      to: { type: 'npc', id: 'npc-1' },
      trust: 0.7,
      respect: 0.6,
      affection: 0.5,
      fear: 0.1,
      resentment: 0.2,
      debt: 0.0,
      updatedTurn: 8,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ];

  const mockScene: Scene = {
    id: 'scene-1',
    gameId,
    name: 'Market Day',
    description: 'A busy day at the market',
    sceneType: 'exploration',
    locationId: 'area-1',
    startedTurn: 1,
    completedTurn: null,
    status: 'active',
    mood: 'peaceful',
    stakes: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const mockFullState: FullGameState = {
    game: mockGameState,
    party: mockParty,
    characters: mockCharacters,
    currentArea: mockArea,
    npcs: mockNPCs,
    traits: mockTraits,
    relationships: mockRelationships,
    perceivedRelationships: [],
    pendingEvolutions: [],
    currentScene: mockScene,
    recentNarration: ['You enter the bustling town square.', 'A merchant waves at you.'],
  };

  beforeEach(() => {
    db = new Database(':memory:');
    // Run schema
    const schemaPath = join(__dirname, '../../../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Insert test game
    db.prepare('INSERT INTO games (id, player_id, current_area_id, turn) VALUES (?, ?, ?, ?)').run(
      gameId,
      'player-1',
      'area-1',
      10
    );

    service = new GameStateFilterService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('filterGameStateForView', () => {
    describe('party view', () => {
      it('should return only display data for party view', () => {
        const result = service.filterGameStateForView(mockFullState, 'party') as PartyViewState;

        expect(result.narration).toEqual(mockFullState.recentNarration);
        expect(result.avatars).toHaveLength(2);
        expect(result.avatars[0].name).toBe('Hero');
        expect(result.avatars[0].pixelArtRef).toBeDefined();
        expect(result.scene).toEqual({
          id: 'scene-1',
          name: 'Market Day',
          sceneType: 'exploration',
          mood: 'peaceful',
        });
        expect(result.area).toEqual({
          id: 'area-1',
          name: 'Town Square',
          description: 'A bustling market square',
        });
      });

      it('should not include any control data in party view', () => {
        const result = service.filterGameStateForView(mockFullState, 'party') as PartyViewState;

        // Party view should not have these properties
        expect((result as unknown as Record<string, unknown>).traits).toBeUndefined();
        expect((result as unknown as Record<string, unknown>).relationships).toBeUndefined();
        expect((result as unknown as Record<string, unknown>).pendingEvolutions).toBeUndefined();
        expect((result as unknown as Record<string, unknown>).game).toBeUndefined();
      });
    });

    describe('dm view', () => {
      it('should return full state for DM view', () => {
        const result = service.filterGameStateForView(mockFullState, 'dm');

        // DM sees everything
        expect(result).toEqual(mockFullState);
      });

      it('should include all traits and relationships in DM view', () => {
        const result = service.filterGameStateForView(mockFullState, 'dm') as FullGameState;

        expect(result.traits).toHaveLength(3);
        expect(result.relationships).toHaveLength(1);
        expect(result.relationships[0].fear).toBe(0.1);
        expect(result.relationships[0].resentment).toBe(0.2);
      });
    });

    describe('player view', () => {
      it('should throw if characterId is not provided', () => {
        expect(() => {
          service.filterGameStateForView(mockFullState, 'player');
        }).toThrow('characterId is required for player view');
      });

      it('should return filtered state for player view', () => {
        const result = service.filterGameStateForView(
          mockFullState,
          'player',
          characterId
        ) as PlayerViewState;

        expect(result.character).toEqual(mockCharacters[0]);
        expect(result.game.id).toBe(gameId);
        expect(result.game.turn).toBe(10);
      });

      it('should filter own traits for player view', () => {
        const result = service.filterGameStateForView(
          mockFullState,
          'player',
          characterId
        ) as PlayerViewState;

        // Should have own traits
        expect(result.ownTraits).toHaveLength(2);
        expect(result.ownTraits.map(t => t.trait)).toContain('brave');
        expect(result.ownTraits.map(t => t.trait)).toContain('legendary');
      });

      it('should filter party members for player view', () => {
        const result = service.filterGameStateForView(
          mockFullState,
          'player',
          characterId
        ) as PlayerViewState;

        // Should not include own character
        expect(result.partyMembers).toHaveLength(1);
        expect(result.partyMembers[0].id).toBe('char-2');
        expect(result.partyMembers[0].name).toBe('Companion');

        // Should show only reputation traits of party members
        expect(result.partyMembers[0].visibleTraits).toContain('mysterious');
      });

      it('should transform relationships to perceived values in player view', () => {
        const result = service.filterGameStateForView(
          mockFullState,
          'player',
          characterId
        ) as PlayerViewState;

        expect(result.relationships).toHaveLength(1);
        expect(result.relationships[0].targetId).toBe('npc-1');
        expect(result.relationships[0].targetName).toBe('Merchant');

        // Should show trust, respect, affection but NOT fear/resentment
        expect(result.relationships[0].perceivedTrust).toBe(0.7);
        expect(result.relationships[0].perceivedRespect).toBe(0.6);
        expect(result.relationships[0].perceivedAffection).toBe(0.5);

        // Fear and resentment should not be visible
        expect((result.relationships[0] as unknown as Record<string, unknown>).fear).toBeUndefined();
        expect(
          (result.relationships[0] as unknown as Record<string, unknown>).resentment
        ).toBeUndefined();
      });

      it('should use perceived values when available', () => {
        const stateWithPerceived: FullGameState = {
          ...mockFullState,
          perceivedRelationships: [
            {
              id: 'perceived-1',
              gameId,
              perceiverId: characterId,
              targetId: 'npc-1',
              perceivedTrust: 0.9,
              perceivedRespect: 0.8,
              perceivedAffection: 0.7,
              lastUpdatedTurn: 9,
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
          ],
        };

        const result = service.filterGameStateForView(
          stateWithPerceived,
          'player',
          characterId
        ) as PlayerViewState;

        // Should use perceived values, not true values
        expect(result.relationships[0].perceivedTrust).toBe(0.9);
        expect(result.relationships[0].perceivedRespect).toBe(0.8);
        expect(result.relationships[0].perceivedAffection).toBe(0.7);
      });
    });
  });

  describe('getPerceivedRelationship', () => {
    it('should return null when no perceived relationship exists', () => {
      const result = service.getPerceivedRelationship(gameId, characterId, 'npc-1');
      expect(result).toBeNull();
    });

    it('should return perceived relationship when it exists', () => {
      // Insert a perceived relationship directly
      db.prepare(`
        INSERT INTO perceived_relationships (id, game_id, perceiver_id, target_id, perceived_trust, last_updated_turn)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('perc-1', gameId, characterId, 'npc-1', 0.9, 5);

      const result = service.getPerceivedRelationship(gameId, characterId, 'npc-1');

      expect(result).not.toBeNull();
      expect(result!.perceivedTrust).toBe(0.9);
    });
  });

  describe('getPerceivedRelationships', () => {
    it('should return empty array when no perceived relationships exist', () => {
      const result = service.getPerceivedRelationships(gameId, characterId);
      expect(result).toEqual([]);
    });

    it('should return all perceived relationships for a perceiver', () => {
      db.prepare(`
        INSERT INTO perceived_relationships (id, game_id, perceiver_id, target_id, perceived_trust, last_updated_turn)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('perc-1', gameId, characterId, 'npc-1', 0.9, 5);

      db.prepare(`
        INSERT INTO perceived_relationships (id, game_id, perceiver_id, target_id, perceived_trust, last_updated_turn)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('perc-2', gameId, characterId, 'char-2', 0.7, 6);

      const result = service.getPerceivedRelationships(gameId, characterId);

      expect(result).toHaveLength(2);
    });
  });
});
