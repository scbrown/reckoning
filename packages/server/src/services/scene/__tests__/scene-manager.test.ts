import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SceneManager } from '../scene-manager.js';
import { SceneRepository } from '../../../db/repositories/scene-repository.js';
import { SceneAvailabilityRepository } from '../../../db/repositories/scene-availability-repository.js';
import { SceneConnectionRepository } from '../../../db/repositories/scene-connection-repository.js';
import { GameRepository } from '../../../db/repositories/game-repository.js';
import type { SceneEvent, SceneEventEmitter, RequirementContext } from '../types.js';
import type { ConnectionRequirements } from '../../../db/repositories/scene-connection-repository.js';
import type { Relationship } from '../../../db/repositories/relationship-repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('SceneManager', () => {
  let db: Database.Database;
  let sceneRepo: SceneRepository;
  let availabilityRepo: SceneAvailabilityRepository;
  let connectionRepo: SceneConnectionRepository;
  let gameRepo: GameRepository;
  let manager: SceneManager;
  let emittedEvents: SceneEvent[];
  let mockEmitter: SceneEventEmitter;

  beforeEach(() => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../../../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create test data
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'default-area', 10)
    `);

    sceneRepo = new SceneRepository(db);
    availabilityRepo = new SceneAvailabilityRepository(db);
    connectionRepo = new SceneConnectionRepository(db);
    gameRepo = new GameRepository(db);

    emittedEvents = [];
    mockEmitter = {
      emit: (event: SceneEvent) => emittedEvents.push(event),
    };

    manager = new SceneManager({
      sceneRepo,
      availabilityRepo,
      connectionRepo,
      gameRepo,
      eventEmitter: mockEmitter,
    });
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('createScene', () => {
    it('should create a scene with minimal input', () => {
      const scene = manager.createScene({
        gameId: 'game-1',
        turn: 1,
      });

      expect(scene.id).toBeDefined();
      expect(scene.gameId).toBe('game-1');
      expect(scene.startedTurn).toBe(1);
      expect(scene.status).toBe('active');
    });

    it('should create a scene with all fields', () => {
      const scene = manager.createScene({
        gameId: 'game-1',
        turn: 5,
        name: 'The Tavern Brawl',
        description: 'A fight breaks out',
        sceneType: 'combat',
        locationId: 'default-area',
        mood: 'tense',
        stakes: 'high',
      });

      expect(scene.name).toBe('The Tavern Brawl');
      expect(scene.description).toBe('A fight breaks out');
      expect(scene.sceneType).toBe('combat');
      expect(scene.locationId).toBe('default-area');
      expect(scene.mood).toBe('tense');
      expect(scene.stakes).toBe('high');
    });

    it('should auto-unlock the scene by default', () => {
      const scene = manager.createScene({
        gameId: 'game-1',
        turn: 1,
      });

      expect(availabilityRepo.isUnlocked('game-1', scene.id)).toBe(true);
    });

    it('should not auto-unlock when autoUnlock is false', () => {
      const scene = manager.createScene({
        gameId: 'game-1',
        turn: 1,
        autoUnlock: false,
      });

      expect(availabilityRepo.isUnlocked('game-1', scene.id)).toBe(false);
    });

    it('should emit scene:created event', () => {
      const scene = manager.createScene({
        gameId: 'game-1',
        turn: 1,
      });

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('scene:created');
      expect((emittedEvents[0] as { type: 'scene:created'; scene: typeof scene }).scene.id).toBe(scene.id);
    });

    it('should record unlockedBy when provided', () => {
      const scene = manager.createScene({
        gameId: 'game-1',
        turn: 1,
        unlockedBy: 'event-123',
      });

      const unlockInfo = availabilityRepo.getUnlockInfo('game-1', scene.id);
      expect(unlockInfo?.unlockedBy).toBe('event-123');
    });
  });

  describe('startScene', () => {
    it('should start a scene and set as current', () => {
      const scene = manager.createScene({
        gameId: 'game-1',
        turn: 1,
      });

      const started = manager.startScene({
        gameId: 'game-1',
        sceneId: scene.id,
        turn: 5,
      });

      expect(started.status).toBe('active');
      expect(started.startedTurn).toBe(5);
      expect(gameRepo.getCurrentSceneId('game-1')).toBe(scene.id);
    });

    it('should auto-unlock scene if not unlocked', () => {
      const scene = manager.createScene({
        gameId: 'game-1',
        turn: 1,
        autoUnlock: false,
      });

      expect(availabilityRepo.isUnlocked('game-1', scene.id)).toBe(false);

      manager.startScene({
        gameId: 'game-1',
        sceneId: scene.id,
        turn: 5,
      });

      expect(availabilityRepo.isUnlocked('game-1', scene.id)).toBe(true);
    });

    it('should emit scene:started event', () => {
      const scene = manager.createScene({
        gameId: 'game-1',
        turn: 1,
      });
      emittedEvents = [];

      manager.startScene({
        gameId: 'game-1',
        sceneId: scene.id,
        turn: 5,
      });

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('scene:started');
    });

    it('should throw if scene not found', () => {
      expect(() =>
        manager.startScene({
          gameId: 'game-1',
          sceneId: 'non-existent',
          turn: 5,
        })
      ).toThrow('Scene not found: non-existent');
    });

    it('should throw if scene belongs to different game', () => {
      db.exec(`
        INSERT INTO games (id, player_id, current_area_id, turn)
        VALUES ('game-2', 'player-2', 'default-area', 1)
      `);

      const scene = manager.createScene({
        gameId: 'game-2',
        turn: 1,
      });

      expect(() =>
        manager.startScene({
          gameId: 'game-1',
          sceneId: scene.id,
          turn: 5,
        })
      ).toThrow(`Scene ${scene.id} does not belong to game game-1`);
    });
  });

  describe('completeScene', () => {
    it('should complete a scene and clear current scene', () => {
      const scene = manager.createScene({
        gameId: 'game-1',
        turn: 1,
      });
      manager.startScene({
        gameId: 'game-1',
        sceneId: scene.id,
        turn: 1,
      });

      const completed = manager.completeScene({
        gameId: 'game-1',
        sceneId: scene.id,
        turn: 10,
      });

      expect(completed.status).toBe('completed');
      expect(completed.completedTurn).toBe(10);
      expect(gameRepo.getCurrentSceneId('game-1')).toBeNull();
    });

    it('should emit scene:completed event', () => {
      const scene = manager.createScene({
        gameId: 'game-1',
        turn: 1,
      });
      emittedEvents = [];

      manager.completeScene({
        gameId: 'game-1',
        sceneId: scene.id,
        turn: 10,
      });

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('scene:completed');
    });

    it('should not clear current scene if completing a different scene', () => {
      const scene1 = manager.createScene({ gameId: 'game-1', turn: 1 });
      const scene2 = manager.createScene({ gameId: 'game-1', turn: 2 });

      manager.startScene({ gameId: 'game-1', sceneId: scene1.id, turn: 1 });

      // Complete scene2 while scene1 is current
      manager.completeScene({ gameId: 'game-1', sceneId: scene2.id, turn: 5 });

      // scene1 should still be current
      expect(gameRepo.getCurrentSceneId('game-1')).toBe(scene1.id);
    });

    it('should throw if scene not found', () => {
      expect(() =>
        manager.completeScene({
          gameId: 'game-1',
          sceneId: 'non-existent',
          turn: 10,
        })
      ).toThrow('Scene not found: non-existent');
    });
  });

  describe('getAvailableScenes', () => {
    it('should return available scenes', () => {
      manager.createScene({ gameId: 'game-1', turn: 1 });
      manager.createScene({ gameId: 'game-1', turn: 2 });
      manager.createScene({ gameId: 'game-1', turn: 3, autoUnlock: false });

      const available = manager.getAvailableScenes('game-1');
      expect(available).toHaveLength(2);
    });

    it('should not return completed scenes', () => {
      const scene = manager.createScene({ gameId: 'game-1', turn: 1 });
      manager.completeScene({ gameId: 'game-1', sceneId: scene.id, turn: 5 });

      const available = manager.getAvailableScenes('game-1');
      expect(available).toHaveLength(0);
    });
  });

  describe('getSceneSummary', () => {
    it('should return scene summary', () => {
      const scene = manager.createScene({
        gameId: 'game-1',
        turn: 1,
        name: 'Test Scene',
      });

      const summary = manager.getSceneSummary('game-1', scene.id);

      expect(summary).not.toBeNull();
      expect(summary!.scene.name).toBe('Test Scene');
      expect(summary!.eventCount).toBe(0);
      expect(summary!.isCurrentScene).toBe(false);
      expect(summary!.isUnlocked).toBe(true);
      expect(summary!.unlockedTurn).toBe(1);
    });

    it('should indicate current scene status', () => {
      const scene = manager.createScene({ gameId: 'game-1', turn: 1 });
      manager.startScene({ gameId: 'game-1', sceneId: scene.id, turn: 1 });

      const summary = manager.getSceneSummary('game-1', scene.id);
      expect(summary!.isCurrentScene).toBe(true);
    });

    it('should return null for non-existent scene', () => {
      const summary = manager.getSceneSummary('game-1', 'non-existent');
      expect(summary).toBeNull();
    });

    it('should return null if scene belongs to different game', () => {
      db.exec(`
        INSERT INTO games (id, player_id, current_area_id, turn)
        VALUES ('game-2', 'player-2', 'default-area', 1)
      `);

      const scene = manager.createScene({ gameId: 'game-2', turn: 1 });
      const summary = manager.getSceneSummary('game-1', scene.id);
      expect(summary).toBeNull();
    });

    it('should count events in scene', () => {
      const scene = manager.createScene({ gameId: 'game-1', turn: 1 });

      // Add events within the scene turn range
      db.exec(`
        INSERT INTO events (id, game_id, turn, event_type, content, location_id, timestamp)
        VALUES
          ('event-1', 'game-1', 1, 'narration', 'Event 1', 'default-area', datetime('now')),
          ('event-2', 'game-1', 2, 'narration', 'Event 2', 'default-area', datetime('now')),
          ('event-3', 'game-1', 3, 'narration', 'Event 3', 'default-area', datetime('now'))
      `);

      const summary = manager.getSceneSummary('game-1', scene.id);
      expect(summary!.eventCount).toBe(3);
    });
  });

  describe('getCurrentScene', () => {
    it('should return current scene when one is set', () => {
      const scene = manager.createScene({ gameId: 'game-1', turn: 1 });
      manager.startScene({ gameId: 'game-1', sceneId: scene.id, turn: 1 });

      const current = manager.getCurrentScene('game-1');
      expect(current).not.toBeNull();
      expect(current!.id).toBe(scene.id);
    });

    it('should return null when no current scene', () => {
      const current = manager.getCurrentScene('game-1');
      expect(current).toBeNull();
    });
  });

  describe('abandonScene', () => {
    it('should abandon a scene and clear current scene', () => {
      const scene = manager.createScene({ gameId: 'game-1', turn: 1 });
      manager.startScene({ gameId: 'game-1', sceneId: scene.id, turn: 1 });

      const abandoned = manager.abandonScene('game-1', scene.id);

      expect(abandoned.status).toBe('abandoned');
      expect(gameRepo.getCurrentSceneId('game-1')).toBeNull();
    });

    it('should emit scene:abandoned event', () => {
      const scene = manager.createScene({ gameId: 'game-1', turn: 1 });
      emittedEvents = [];

      manager.abandonScene('game-1', scene.id);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('scene:abandoned');
    });

    it('should throw if scene not found', () => {
      expect(() => manager.abandonScene('game-1', 'non-existent')).toThrow(
        'Scene not found: non-existent'
      );
    });
  });

  describe('unlockScene', () => {
    it('should unlock a scene', () => {
      const scene = manager.createScene({
        gameId: 'game-1',
        turn: 1,
        autoUnlock: false,
      });

      expect(manager.isSceneUnlocked('game-1', scene.id)).toBe(false);

      manager.unlockScene('game-1', scene.id, 5, 'quest-complete');

      expect(manager.isSceneUnlocked('game-1', scene.id)).toBe(true);
      const unlockInfo = availabilityRepo.getUnlockInfo('game-1', scene.id);
      expect(unlockInfo?.unlockedTurn).toBe(5);
      expect(unlockInfo?.unlockedBy).toBe('quest-complete');
    });

    it('should throw if scene not found', () => {
      expect(() => manager.unlockScene('game-1', 'non-existent', 5)).toThrow(
        'Scene not found: non-existent'
      );
    });
  });

  describe('isSceneUnlocked', () => {
    it('should return true for unlocked scenes', () => {
      const scene = manager.createScene({ gameId: 'game-1', turn: 1 });
      expect(manager.isSceneUnlocked('game-1', scene.id)).toBe(true);
    });

    it('should return false for locked scenes', () => {
      const scene = manager.createScene({
        gameId: 'game-1',
        turn: 1,
        autoUnlock: false,
      });
      expect(manager.isSceneUnlocked('game-1', scene.id)).toBe(false);
    });
  });

  describe('getConnectedScenes', () => {
    it('should return connected unlocked scenes', () => {
      const scene1 = manager.createScene({ gameId: 'game-1', turn: 1 });
      const scene2 = manager.createScene({ gameId: 'game-1', turn: 2 });
      const scene3 = manager.createScene({
        gameId: 'game-1',
        turn: 3,
        autoUnlock: false,
      });

      // Create connections
      connectionRepo.create({
        gameId: 'game-1',
        fromSceneId: scene1.id,
        toSceneId: scene2.id,
      });
      connectionRepo.create({
        gameId: 'game-1',
        fromSceneId: scene1.id,
        toSceneId: scene3.id,
      });

      const connected = manager.getConnectedScenes('game-1', scene1.id);

      // Only scene2 should be returned (scene3 is not unlocked)
      expect(connected).toHaveLength(1);
      expect(connected[0].id).toBe(scene2.id);
    });

    it('should return empty array when no connections', () => {
      const scene = manager.createScene({ gameId: 'game-1', turn: 1 });
      const connected = manager.getConnectedScenes('game-1', scene.id);
      expect(connected).toHaveLength(0);
    });
  });

  describe('without event emitter', () => {
    it('should work without event emitter', () => {
      const managerNoEmitter = new SceneManager({
        sceneRepo,
        availabilityRepo,
        connectionRepo,
        gameRepo,
      });

      const scene = managerNoEmitter.createScene({
        gameId: 'game-1',
        turn: 1,
      });

      expect(scene.id).toBeDefined();
    });
  });

  describe('evaluateRequirements', () => {
    // Helper to create a basic context
    const createContext = (overrides: Partial<RequirementContext> = {}): RequirementContext => ({
      flags: {},
      playerTraits: [],
      relationships: [],
      ...overrides,
    });

    // Helper to create a relationship
    const createRelationship = (
      toType: 'player' | 'character' | 'npc' | 'location',
      toId: string,
      dimensions: Partial<Pick<Relationship, 'trust' | 'respect' | 'affection' | 'fear' | 'resentment' | 'debt'>> = {}
    ): Relationship => ({
      id: 'rel-1',
      gameId: 'game-1',
      from: { type: 'player', id: 'player-1' },
      to: { type: toType, id: toId },
      trust: 0.5,
      respect: 0.5,
      affection: 0.5,
      fear: 0.0,
      resentment: 0.0,
      debt: 0.0,
      updatedTurn: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...dimensions,
    });

    describe('null/undefined requirements', () => {
      it('should return true for null requirements', () => {
        const context = createContext();
        expect(manager.evaluateRequirements(null, context)).toBe(true);
      });

      it('should return true for undefined requirements', () => {
        const context = createContext();
        expect(manager.evaluateRequirements(undefined, context)).toBe(true);
      });

      it('should return true for empty requirements object', () => {
        const context = createContext();
        expect(manager.evaluateRequirements({}, context)).toBe(true);
      });
    });

    describe('flag requirements', () => {
      it('should return true when all flags are set', () => {
        const requirements: ConnectionRequirements = {
          flags: ['has_key', 'talked_to_guard'],
        };
        const context = createContext({
          flags: { has_key: true, talked_to_guard: true, other_flag: true },
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(true);
      });

      it('should return false when a flag is missing', () => {
        const requirements: ConnectionRequirements = {
          flags: ['has_key', 'talked_to_guard'],
        };
        const context = createContext({
          flags: { has_key: true },
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(false);
      });

      it('should return false when a flag is false', () => {
        const requirements: ConnectionRequirements = {
          flags: ['has_key'],
        };
        const context = createContext({
          flags: { has_key: false },
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(false);
      });

      it('should return true for empty flags array', () => {
        const requirements: ConnectionRequirements = {
          flags: [],
        };
        const context = createContext();

        expect(manager.evaluateRequirements(requirements, context)).toBe(true);
      });
    });

    describe('trait requirements', () => {
      it('should return true when player has all traits', () => {
        const requirements: ConnectionRequirements = {
          traits: ['merciful', 'brave'],
        };
        const context = createContext({
          playerTraits: ['merciful', 'brave', 'cunning'],
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(true);
      });

      it('should return false when player is missing a trait', () => {
        const requirements: ConnectionRequirements = {
          traits: ['merciful', 'brave'],
        };
        const context = createContext({
          playerTraits: ['merciful'],
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(false);
      });

      it('should return false when player has no traits', () => {
        const requirements: ConnectionRequirements = {
          traits: ['merciful'],
        };
        const context = createContext({
          playerTraits: [],
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(false);
      });

      it('should return true for empty traits array', () => {
        const requirements: ConnectionRequirements = {
          traits: [],
        };
        const context = createContext();

        expect(manager.evaluateRequirements(requirements, context)).toBe(true);
      });
    });

    describe('relationship requirements', () => {
      it('should return true when relationship meets minValue threshold', () => {
        const requirements: ConnectionRequirements = {
          relationships: [
            { entityType: 'npc', entityId: 'captain', dimension: 'trust', minValue: 0.6 },
          ],
        };
        const context = createContext({
          relationships: [createRelationship('npc', 'captain', { trust: 0.8 })],
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(true);
      });

      it('should return true when relationship equals minValue threshold', () => {
        const requirements: ConnectionRequirements = {
          relationships: [
            { entityType: 'npc', entityId: 'captain', dimension: 'trust', minValue: 0.6 },
          ],
        };
        const context = createContext({
          relationships: [createRelationship('npc', 'captain', { trust: 0.6 })],
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(true);
      });

      it('should return false when relationship is below minValue threshold', () => {
        const requirements: ConnectionRequirements = {
          relationships: [
            { entityType: 'npc', entityId: 'captain', dimension: 'trust', minValue: 0.6 },
          ],
        };
        const context = createContext({
          relationships: [createRelationship('npc', 'captain', { trust: 0.4 })],
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(false);
      });

      it('should return false when relationship with entity does not exist', () => {
        const requirements: ConnectionRequirements = {
          relationships: [
            { entityType: 'npc', entityId: 'captain', dimension: 'trust', minValue: 0.6 },
          ],
        };
        const context = createContext({
          relationships: [createRelationship('npc', 'merchant', { trust: 0.8 })],
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(false);
      });

      it('should return true when relationship meets maxValue threshold', () => {
        const requirements: ConnectionRequirements = {
          relationships: [
            { entityType: 'npc', entityId: 'enemy', dimension: 'fear', maxValue: 0.3 },
          ],
        };
        const context = createContext({
          relationships: [createRelationship('npc', 'enemy', { fear: 0.2 })],
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(true);
      });

      it('should return false when relationship exceeds maxValue threshold', () => {
        const requirements: ConnectionRequirements = {
          relationships: [
            { entityType: 'npc', entityId: 'enemy', dimension: 'fear', maxValue: 0.3 },
          ],
        };
        const context = createContext({
          relationships: [createRelationship('npc', 'enemy', { fear: 0.5 })],
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(false);
      });

      it('should check both minValue and maxValue when specified', () => {
        const requirements: ConnectionRequirements = {
          relationships: [
            { entityType: 'npc', entityId: 'merchant', dimension: 'trust', minValue: 0.4, maxValue: 0.8 },
          ],
        };

        // Within range
        expect(
          manager.evaluateRequirements(requirements, createContext({
            relationships: [createRelationship('npc', 'merchant', { trust: 0.6 })],
          }))
        ).toBe(true);

        // Below minValue
        expect(
          manager.evaluateRequirements(requirements, createContext({
            relationships: [createRelationship('npc', 'merchant', { trust: 0.2 })],
          }))
        ).toBe(false);

        // Above maxValue
        expect(
          manager.evaluateRequirements(requirements, createContext({
            relationships: [createRelationship('npc', 'merchant', { trust: 0.9 })],
          }))
        ).toBe(false);
      });

      it('should check multiple relationship requirements (all must pass)', () => {
        const requirements: ConnectionRequirements = {
          relationships: [
            { entityType: 'npc', entityId: 'captain', dimension: 'trust', minValue: 0.6 },
            { entityType: 'npc', entityId: 'merchant', dimension: 'respect', minValue: 0.5 },
          ],
        };
        const context = createContext({
          relationships: [
            createRelationship('npc', 'captain', { trust: 0.8 }),
            createRelationship('npc', 'merchant', { respect: 0.7 }),
          ],
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(true);
      });

      it('should return false if any relationship requirement fails', () => {
        const requirements: ConnectionRequirements = {
          relationships: [
            { entityType: 'npc', entityId: 'captain', dimension: 'trust', minValue: 0.6 },
            { entityType: 'npc', entityId: 'merchant', dimension: 'respect', minValue: 0.5 },
          ],
        };
        const context = createContext({
          relationships: [
            createRelationship('npc', 'captain', { trust: 0.8 }),
            createRelationship('npc', 'merchant', { respect: 0.3 }), // Fails
          ],
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(false);
      });

      it('should return true for empty relationships array', () => {
        const requirements: ConnectionRequirements = {
          relationships: [],
        };
        const context = createContext();

        expect(manager.evaluateRequirements(requirements, context)).toBe(true);
      });
    });

    describe('combined requirements', () => {
      it('should return true when all requirement types pass', () => {
        const requirements: ConnectionRequirements = {
          flags: ['has_key'],
          traits: ['merciful'],
          relationships: [
            { entityType: 'npc', entityId: 'captain', dimension: 'trust', minValue: 0.6 },
          ],
        };
        const context = createContext({
          flags: { has_key: true },
          playerTraits: ['merciful', 'brave'],
          relationships: [createRelationship('npc', 'captain', { trust: 0.8 })],
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(true);
      });

      it('should return false when flags fail but others pass', () => {
        const requirements: ConnectionRequirements = {
          flags: ['has_key'],
          traits: ['merciful'],
          relationships: [
            { entityType: 'npc', entityId: 'captain', dimension: 'trust', minValue: 0.6 },
          ],
        };
        const context = createContext({
          flags: { has_key: false }, // Fails
          playerTraits: ['merciful'],
          relationships: [createRelationship('npc', 'captain', { trust: 0.8 })],
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(false);
      });

      it('should return false when traits fail but others pass', () => {
        const requirements: ConnectionRequirements = {
          flags: ['has_key'],
          traits: ['merciful'],
          relationships: [
            { entityType: 'npc', entityId: 'captain', dimension: 'trust', minValue: 0.6 },
          ],
        };
        const context = createContext({
          flags: { has_key: true },
          playerTraits: ['brave'], // Missing 'merciful'
          relationships: [createRelationship('npc', 'captain', { trust: 0.8 })],
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(false);
      });

      it('should return false when relationships fail but others pass', () => {
        const requirements: ConnectionRequirements = {
          flags: ['has_key'],
          traits: ['merciful'],
          relationships: [
            { entityType: 'npc', entityId: 'captain', dimension: 'trust', minValue: 0.6 },
          ],
        };
        const context = createContext({
          flags: { has_key: true },
          playerTraits: ['merciful'],
          relationships: [createRelationship('npc', 'captain', { trust: 0.3 })], // Fails
        });

        expect(manager.evaluateRequirements(requirements, context)).toBe(false);
      });
    });
  });
});
