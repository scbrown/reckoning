import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SceneConnectionRepository } from '../scene-connection-repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('SceneConnectionRepository', () => {
  let db: Database.Database;
  let repo: SceneConnectionRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a test game and scenes
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'area-1', 5)
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, name, started_turn, status)
      VALUES ('scene-1', 'game-1', 'Starting Scene', 1, 'active')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, name, started_turn, status)
      VALUES ('scene-2', 'game-1', 'Second Scene', 2, 'active')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, name, started_turn, status)
      VALUES ('scene-3', 'game-1', 'Third Scene', 3, 'active')
    `);

    repo = new SceneConnectionRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('create', () => {
    it('should create a connection with default type', () => {
      const connection = repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
      });

      expect(connection.id).toBeDefined();
      expect(connection.gameId).toBe('game-1');
      expect(connection.fromSceneId).toBe('scene-1');
      expect(connection.toSceneId).toBe('scene-2');
      expect(connection.connectionType).toBe('path');
      expect(connection.requirements).toBeNull();
      expect(connection.description).toBeNull();
      expect(connection.createdAt).toBeDefined();
    });

    it('should create a connection with custom type', () => {
      const connection = repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
        connectionType: 'conditional',
      });

      expect(connection.connectionType).toBe('conditional');
    });

    it('should create a connection with requirements', () => {
      const requirements = { items: ['key-1'], flags: ['door_unlocked'] };
      const connection = repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
        requirements,
        connectionType: 'conditional',
        description: 'A locked door requiring a key',
      });

      expect(connection.requirements).toEqual(requirements);
      expect(connection.description).toBe('A locked door requiring a key');
    });

    it('should create a hidden connection', () => {
      const connection = repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
        connectionType: 'hidden',
        description: 'A secret passage',
      });

      expect(connection.connectionType).toBe('hidden');
    });

    it('should create a one-way connection', () => {
      const connection = repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
        connectionType: 'one-way',
      });

      expect(connection.connectionType).toBe('one-way');
    });

    it('should create a teleport connection', () => {
      const connection = repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
        connectionType: 'teleport',
      });

      expect(connection.connectionType).toBe('teleport');
    });
  });

  describe('findById', () => {
    it('should find connection by ID', () => {
      const created = repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
        description: 'Test connection',
      });

      const found = repo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.description).toBe('Test connection');
    });

    it('should return null for non-existent ID', () => {
      const found = repo.findById('non-existent-id');
      expect(found).toBeNull();
    });

    it('should parse JSON requirements correctly', () => {
      const requirements = { items: ['key-1'], flags: ['flag-1'], stats: { strength: 10 } };
      const created = repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
        requirements,
      });

      const found = repo.findById(created.id);
      expect(found!.requirements).toEqual(requirements);
    });
  });

  describe('findFromScene', () => {
    it('should find all connections from a scene', () => {
      repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
      });

      repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-3',
      });

      repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-2',
        toSceneId: 'scene-3',
      });

      const connections = repo.findFromScene('game-1', 'scene-1');
      expect(connections).toHaveLength(2);
      expect(connections.every(c => c.fromSceneId === 'scene-1')).toBe(true);
    });

    it('should return empty array when no connections exist', () => {
      const connections = repo.findFromScene('game-1', 'scene-1');
      expect(connections).toHaveLength(0);
    });

    it('should not return connections from other games', () => {
      // Create second game and scenes
      db.exec(`
        INSERT INTO games (id, player_id, current_area_id, turn)
        VALUES ('game-2', 'player-2', 'area-1', 1)
      `);
      db.exec(`
        INSERT INTO scenes (id, game_id, name, started_turn, status)
        VALUES ('scene-2-1', 'game-2', 'Other Game Scene', 1, 'active')
      `);
      db.exec(`
        INSERT INTO scenes (id, game_id, name, started_turn, status)
        VALUES ('scene-2-2', 'game-2', 'Other Game Scene 2', 2, 'active')
      `);

      repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
      });

      repo.create({
        gameId: 'game-2',
        fromSceneId: 'scene-2-1',
        toSceneId: 'scene-2-2',
      });

      const connections = repo.findFromScene('game-1', 'scene-1');
      expect(connections).toHaveLength(1);
      expect(connections[0].gameId).toBe('game-1');
    });
  });

  describe('findToScene', () => {
    it('should find all connections to a scene', () => {
      repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-3',
      });

      repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-2',
        toSceneId: 'scene-3',
      });

      repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
      });

      const connections = repo.findToScene('game-1', 'scene-3');
      expect(connections).toHaveLength(2);
      expect(connections.every(c => c.toSceneId === 'scene-3')).toBe(true);
    });

    it('should return empty array when no connections exist', () => {
      const connections = repo.findToScene('game-1', 'scene-3');
      expect(connections).toHaveLength(0);
    });
  });

  describe('getUnlockedConnections', () => {
    it('should return connections where destination is unlocked', () => {
      // Create connections
      repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
      });

      repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-3',
      });

      // Unlock only scene-2
      db.exec(`
        INSERT INTO scene_availability (game_id, scene_id, unlocked_turn, unlocked_by)
        VALUES ('game-1', 'scene-2', 1, 'player-1')
      `);

      const unlocked = repo.getUnlockedConnections('game-1', 'scene-1');
      expect(unlocked).toHaveLength(1);
      expect(unlocked[0].toSceneId).toBe('scene-2');
    });

    it('should return all connections when all destinations are unlocked', () => {
      // Create connections
      repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
      });

      repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-3',
      });

      // Unlock both scenes
      db.exec(`
        INSERT INTO scene_availability (game_id, scene_id, unlocked_turn, unlocked_by)
        VALUES ('game-1', 'scene-2', 1, 'player-1')
      `);
      db.exec(`
        INSERT INTO scene_availability (game_id, scene_id, unlocked_turn, unlocked_by)
        VALUES ('game-1', 'scene-3', 2, 'event-1')
      `);

      const unlocked = repo.getUnlockedConnections('game-1', 'scene-1');
      expect(unlocked).toHaveLength(2);
    });

    it('should return empty array when no destinations are unlocked', () => {
      // Create connections but no unlocks
      repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
      });

      const unlocked = repo.getUnlockedConnections('game-1', 'scene-1');
      expect(unlocked).toHaveLength(0);
    });

    it('should return empty array when no connections exist', () => {
      const unlocked = repo.getUnlockedConnections('game-1', 'scene-1');
      expect(unlocked).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('should delete a connection', () => {
      const created = repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
      });

      repo.delete(created.id);
      const found = repo.findById(created.id);
      expect(found).toBeNull();
    });

    it('should not throw when deleting non-existent connection', () => {
      expect(() => repo.delete('non-existent-id')).not.toThrow();
    });
  });

  describe('deleteByGame', () => {
    it('should delete all connections for a game', () => {
      repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
      });

      repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-2',
        toSceneId: 'scene-3',
      });

      repo.deleteByGame('game-1');

      const fromScene1 = repo.findFromScene('game-1', 'scene-1');
      const fromScene2 = repo.findFromScene('game-1', 'scene-2');
      expect(fromScene1).toHaveLength(0);
      expect(fromScene2).toHaveLength(0);
    });

    it('should not affect other games', () => {
      // Create second game and scenes
      db.exec(`
        INSERT INTO games (id, player_id, current_area_id, turn)
        VALUES ('game-2', 'player-2', 'area-1', 1)
      `);
      db.exec(`
        INSERT INTO scenes (id, game_id, name, started_turn, status)
        VALUES ('scene-2-1', 'game-2', 'Other Game Scene', 1, 'active')
      `);
      db.exec(`
        INSERT INTO scenes (id, game_id, name, started_turn, status)
        VALUES ('scene-2-2', 'game-2', 'Other Game Scene 2', 2, 'active')
      `);

      repo.create({
        gameId: 'game-1',
        fromSceneId: 'scene-1',
        toSceneId: 'scene-2',
      });

      repo.create({
        gameId: 'game-2',
        fromSceneId: 'scene-2-1',
        toSceneId: 'scene-2-2',
      });

      repo.deleteByGame('game-1');

      const game1Connections = repo.findFromScene('game-1', 'scene-1');
      const game2Connections = repo.findFromScene('game-2', 'scene-2-1');
      expect(game1Connections).toHaveLength(0);
      expect(game2Connections).toHaveLength(1);
    });
  });
});
