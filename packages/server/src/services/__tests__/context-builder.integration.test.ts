/**
 * Integration Tests for Context Builder
 *
 * These tests verify the ContextBuilder works correctly with a real SQLite database.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createContextBuilder, type EvolutionRepository } from '../ai/context-builder.js';
import { runMigrations } from '../../db/index.js';
import type { EntitySummary } from '../evolution/types.js';
import type { EntityType } from '../../db/repositories/trait-repository.js';

describe('ContextBuilder Integration Tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    runMigrations(db);

    // Seed test data
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
  });

  function seedTestData(database: Database.Database) {
    // Create a game
    database
      .prepare(
        `INSERT INTO games (id, player_id, current_area_id, turn, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
      )
      .run('test-game-001', 'player-001', 'tavern_common', 5);

    // Create an area
    database
      .prepare(
        `INSERT INTO areas (id, name, description, tags)
         VALUES (?, ?, ?, ?)`
      )
      .run(
        'tavern_common',
        'The Wayward Rest - Common Room',
        'A warm and inviting tavern common room with a roaring fire.',
        JSON.stringify(['tavern', 'indoor', 'social'])
      );

    // Create area exits
    database
      .prepare(
        `INSERT INTO area_exits (area_id, direction, target_area_id, description, locked)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        'tavern_common',
        'north',
        'tavern_stairs',
        'A narrow staircase leads up.',
        0
      );

    database
      .prepare(
        `INSERT INTO area_exits (area_id, direction, target_area_id, description, locked)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run('tavern_common', 'south', 'village_street', 'The front door.', 0);

    // Create area objects
    database
      .prepare(
        `INSERT INTO area_objects (id, area_id, name, description, interactable, tags)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        'hearth_01',
        'tavern_common',
        'Stone Hearth',
        'A large stone hearth with a roaring fire.',
        1,
        JSON.stringify(['fire', 'warmth'])
      );

    // Create an NPC in the area
    database
      .prepare(
        `INSERT INTO npcs (id, name, description, current_area_id, disposition, tags)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        'maren_01',
        'Maren',
        'The bartender of The Wayward Rest.',
        'tavern_common',
        'friendly',
        JSON.stringify(['bartender', 'innkeeper'])
      );

    // Create a party for the game
    database
      .prepare(
        `INSERT INTO parties (id, game_id, name, created_at, updated_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))`
      )
      .run('party-001', 'test-game-001', 'The Wayward Band');

    // Create party members using the new characters table
    database
      .prepare(
        `INSERT INTO characters (id, party_id, name, description, class, role, stats, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      )
      .run(
        'char-001',
        'party-001',
        'Theron',
        'A brave warrior from the northern lands.',
        'Fighter',
        'player',
        JSON.stringify({ health: 100, maxHealth: 100 })
      );

    database
      .prepare(
        `INSERT INTO characters (id, party_id, name, description, class, role, stats, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      )
      .run(
        'char-002',
        'party-001',
        'Elara',
        'A mysterious mage with arcane knowledge.',
        'Wizard',
        'member',
        JSON.stringify({ health: 80, maxHealth: 100 })
      );

    // Create some events
    database
      .prepare(
        `INSERT INTO events (id, game_id, turn, event_type, content, location_id, witnesses)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'event-001',
        'test-game-001',
        3,
        'narration',
        'The party enters the tavern, seeking warmth from the cold night.',
        'tavern_common',
        JSON.stringify([])
      );

    database
      .prepare(
        `INSERT INTO events (id, game_id, turn, event_type, content, speaker, location_id, witnesses)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'event-002',
        'test-game-001',
        4,
        'npc_dialogue',
        'Welcome to The Wayward Rest! What can I get you?',
        'Maren',
        'tavern_common',
        JSON.stringify(['maren_01'])
      );

    database
      .prepare(
        `INSERT INTO events (id, game_id, turn, event_type, content, speaker, location_id, witnesses)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'event-003',
        'test-game-001',
        5,
        'party_dialogue',
        'Two ales, please. And information about the road ahead.',
        'Theron',
        'tavern_common',
        JSON.stringify(['maren_01'])
      );
  }

  describe('createContextBuilder', () => {
    it('should create a working context builder from database', async () => {
      const builder = createContextBuilder(db);

      const context = await builder.build('test-game-001', 'narration');

      expect(context).toBeDefined();
      expect(context.type).toBe('narration');
    });
  });

  describe('build with real database', () => {
    it('should fetch game state correctly', async () => {
      const builder = createContextBuilder(db);

      const context = await builder.build('test-game-001', 'narration');

      expect(context.gameState.id).toBe('test-game-001');
      expect(context.gameState.playerId).toBe('player-001');
      expect(context.gameState.currentAreaId).toBe('tavern_common');
      expect(context.gameState.turn).toBe(5);
    });

    it('should fetch area with all details', async () => {
      const builder = createContextBuilder(db);

      const context = await builder.build('test-game-001', 'narration');

      expect(context.currentArea.id).toBe('tavern_common');
      expect(context.currentArea.name).toBe('The Wayward Rest - Common Room');
      expect(context.currentArea.tags).toContain('tavern');

      // Check exits
      expect(context.currentArea.exits).toHaveLength(2);
      expect(context.currentArea.exits.map((e) => e.direction)).toContain('north');
      expect(context.currentArea.exits.map((e) => e.direction)).toContain('south');

      // Check objects
      expect(context.currentArea.objects).toHaveLength(1);
      expect(context.currentArea.objects[0].name).toBe('Stone Hearth');

      // Check NPCs
      expect(context.currentArea.npcs).toHaveLength(1);
      expect(context.currentArea.npcs[0].name).toBe('Maren');
    });

    it('should fetch party members', async () => {
      const builder = createContextBuilder(db);

      const context = await builder.build('test-game-001', 'narration');

      expect(context.party).toHaveLength(2);
      expect(context.party.map((c) => c.name)).toContain('Theron');
      expect(context.party.map((c) => c.name)).toContain('Elara');
    });

    it('should fetch recent events in chronological order', async () => {
      const builder = createContextBuilder(db);

      const context = await builder.build('test-game-001', 'narration');

      expect(context.recentHistory).toHaveLength(3);
      // Events should be in chronological order (oldest first)
      expect(context.recentHistory[0]).toContain('enters the tavern');
      expect(context.recentHistory[1]).toContain('Welcome to The Wayward Rest');
      expect(context.recentHistory[2]).toContain('Two ales');
    });

    it('should format events with speaker prefix', async () => {
      const builder = createContextBuilder(db);

      const context = await builder.build('test-game-001', 'narration');

      // Event with speaker
      expect(context.recentHistory[1]).toContain('Maren:');
      expect(context.recentHistory[2]).toContain('Theron:');

      // Event without speaker (narration)
      expect(context.recentHistory[0]).not.toContain(':');
      expect(context.recentHistory[0]).toMatch(/^\[narration\]/);
    });

    it('should include NPCs present in area', async () => {
      const builder = createContextBuilder(db);

      const context = await builder.build('test-game-001', 'narration');

      expect(context.npcsPresent).toHaveLength(1);
      expect(context.npcsPresent[0].name).toBe('Maren');
      expect(context.npcsPresent[0].disposition).toBe('friendly');
    });

    it('should include dmGuidance when provided', async () => {
      const builder = createContextBuilder(db);

      const context = await builder.build('test-game-001', 'narration', {
        dmGuidance: 'Make the scene feel mysterious.',
      });

      expect(context.dmGuidance).toBe('Make the scene feel mysterious.');
    });
  });

  describe('error handling', () => {
    it('should throw error for non-existent game', async () => {
      const builder = createContextBuilder(db);

      await expect(
        builder.build('nonexistent-game', 'narration')
      ).rejects.toThrow('Game not found: nonexistent-game');
    });

    it('should throw error for non-existent area', async () => {
      // Create a game pointing to a non-existent area
      db.prepare(
        `INSERT INTO games (id, player_id, current_area_id, turn)
         VALUES (?, ?, ?, ?)`
      ).run('broken-game', 'player-001', 'nonexistent-area', 1);

      const builder = createContextBuilder(db);

      await expect(builder.build('broken-game', 'narration')).rejects.toThrow(
        'Area not found: nonexistent-area'
      );
    });
  });

  describe('empty data handling', () => {
    it('should handle game with no party members', async () => {
      // Create a game with no party
      db.prepare(
        `INSERT INTO games (id, player_id, current_area_id, turn)
         VALUES (?, ?, ?, ?)`
      ).run('solo-game', 'player-002', 'tavern_common', 1);

      const builder = createContextBuilder(db);

      const context = await builder.build('solo-game', 'narration');

      expect(context.party).toEqual([]);
    });

    it('should handle game with no events', async () => {
      // Create a game with no events
      db.prepare(
        `INSERT INTO games (id, player_id, current_area_id, turn)
         VALUES (?, ?, ?, ?)`
      ).run('fresh-game', 'player-003', 'tavern_common', 0);

      const builder = createContextBuilder(db);

      const context = await builder.build('fresh-game', 'narration');

      expect(context.recentHistory).toEqual([]);
    });

    it('should handle area with no exits or objects', async () => {
      // Create a minimal area
      db.prepare(
        `INSERT INTO areas (id, name, description, tags)
         VALUES (?, ?, ?, ?)`
      ).run('void', 'The Void', 'An empty space.', JSON.stringify([]));

      db.prepare(
        `INSERT INTO games (id, player_id, current_area_id, turn)
         VALUES (?, ?, ?, ?)`
      ).run('void-game', 'player-004', 'void', 1);

      const builder = createContextBuilder(db);

      const context = await builder.build('void-game', 'narration');

      expect(context.currentArea.exits).toEqual([]);
      expect(context.currentArea.objects).toEqual([]);
      expect(context.currentArea.npcs).toEqual([]);
    });
  });

  describe('evolution context integration', () => {
    // Mock evolution repository for testing
    function createMockEvolutionRepo(
      summaries: Map<string, EntitySummary>
    ): EvolutionRepository {
      return {
        getEntitySummary(
          _gameId: string,
          entityType: EntityType,
          entityId: string
        ): EntitySummary {
          const key = `${entityType}:${entityId}`;
          return (
            summaries.get(key) ?? {
              entityType,
              entityId,
              traits: [],
              relationships: [],
            }
          );
        },
      };
    }

    it('should include player evolution when repository provided', async () => {
      const summaries = new Map<string, EntitySummary>();
      summaries.set('player:char-001', {
        entityType: 'player',
        entityId: 'char-001',
        traits: ['battle-hardened', 'hopeful'],
        relationships: [
          {
            targetType: 'npc',
            targetId: 'maren_01',
            label: 'friend',
            dimensions: {
              trust: 0.7,
              respect: 0.6,
              affection: 0.65,
              fear: 0.0,
              resentment: 0.0,
              debt: 0.0,
            },
          },
        ],
      });

      const evolutionRepo = createMockEvolutionRepo(summaries);
      const builder = createContextBuilder(db, { evolutionRepo });

      const context = await builder.build('test-game-001', 'narration');

      expect(context.playerEvolution).toBeDefined();
      expect(context.playerEvolution?.name).toBe('Theron');
      expect(context.playerEvolution?.traits).toEqual(['battle-hardened', 'hopeful']);
      expect(context.playerEvolution?.relationships).toHaveLength(1);
      expect(context.playerEvolution?.relationships[0].label).toBe('friend');
      expect(context.playerEvolution?.relationships[0].targetName).toBe('Maren');
    });

    it('should include party member evolutions', async () => {
      const summaries = new Map<string, EntitySummary>();
      // Player
      summaries.set('player:char-001', {
        entityType: 'player',
        entityId: 'char-001',
        traits: ['hopeful'],
        relationships: [],
      });
      // Party member (Elara)
      summaries.set('character:char-002', {
        entityType: 'character',
        entityId: 'char-002',
        traits: ['scholarly', 'guarded'],
        relationships: [],
      });

      const evolutionRepo = createMockEvolutionRepo(summaries);
      const builder = createContextBuilder(db, { evolutionRepo });

      const context = await builder.build('test-game-001', 'narration');

      expect(context.partyEvolutions).toBeDefined();
      expect(context.partyEvolutions).toHaveLength(1);
      expect(context.partyEvolutions?.[0].name).toBe('Elara');
      expect(context.partyEvolutions?.[0].traits).toEqual(['scholarly', 'guarded']);
    });

    it('should include NPC evolutions for NPCs in current area', async () => {
      const summaries = new Map<string, EntitySummary>();
      // Player (required)
      summaries.set('player:char-001', {
        entityType: 'player',
        entityId: 'char-001',
        traits: [],
        relationships: [],
      });
      // NPC (Maren)
      summaries.set('npc:maren_01', {
        entityType: 'npc',
        entityId: 'maren_01',
        traits: ['street-wise', 'merciful'],
        relationships: [
          {
            targetType: 'player',
            targetId: 'char-001',
            label: 'ally',
            dimensions: {
              trust: 0.65,
              respect: 0.7,
              affection: 0.4,
              fear: 0.0,
              resentment: 0.0,
              debt: 0.0,
            },
          },
        ],
      });

      const evolutionRepo = createMockEvolutionRepo(summaries);
      const builder = createContextBuilder(db, { evolutionRepo });

      const context = await builder.build('test-game-001', 'narration');

      expect(context.npcEvolutions).toBeDefined();
      expect(context.npcEvolutions).toHaveLength(1);
      expect(context.npcEvolutions?.[0].name).toBe('Maren');
      expect(context.npcEvolutions?.[0].traits).toEqual(['street-wise', 'merciful']);
      expect(context.npcEvolutions?.[0].relationships[0].label).toBe('ally');
    });

    it('should not include evolution data when no repository provided', async () => {
      const builder = createContextBuilder(db);

      const context = await builder.build('test-game-001', 'narration');

      expect(context.playerEvolution).toBeUndefined();
      expect(context.partyEvolutions).toBeUndefined();
      expect(context.npcEvolutions).toBeUndefined();
    });

    it('should resolve relationship target names from name map', async () => {
      const summaries = new Map<string, EntitySummary>();
      summaries.set('player:char-001', {
        entityType: 'player',
        entityId: 'char-001',
        traits: [],
        relationships: [
          // Relationship with party member
          {
            targetType: 'character',
            targetId: 'char-002',
            label: 'devoted',
            dimensions: {
              trust: 0.8,
              respect: 0.8,
              affection: 0.75,
              fear: 0.0,
              resentment: 0.0,
              debt: 0.0,
            },
          },
          // Relationship with unknown entity (should use ID as fallback)
          {
            targetType: 'npc',
            targetId: 'unknown-npc',
            label: 'wary',
            dimensions: {
              trust: 0.2,
              respect: 0.3,
              affection: 0.1,
              fear: 0.3,
              resentment: 0.0,
              debt: 0.0,
            },
          },
        ],
      });

      const evolutionRepo = createMockEvolutionRepo(summaries);
      const builder = createContextBuilder(db, { evolutionRepo });

      const context = await builder.build('test-game-001', 'narration');

      expect(context.playerEvolution?.relationships).toHaveLength(2);
      // Known entity should have resolved name
      expect(context.playerEvolution?.relationships[0].targetName).toBe('Elara');
      // Unknown entity should fall back to ID
      expect(context.playerEvolution?.relationships[1].targetName).toBe('unknown-npc');
    });
  });
});
