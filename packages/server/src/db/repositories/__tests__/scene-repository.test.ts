import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SceneRepository } from '../scene-repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('SceneRepository', () => {
  let db: Database.Database;
  let repo: SceneRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a test game
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'area-1', 10)
    `);

    // Create a test area
    db.exec(`
      INSERT INTO areas (id, name, description)
      VALUES ('area-1', 'Test Area', 'A test area')
    `);

    repo = new SceneRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('create', () => {
    it('should create a scene with minimal input', () => {
      const scene = repo.create({
        gameId: 'game-1',
        startedTurn: 1,
      });

      expect(scene.id).toBeDefined();
      expect(scene.gameId).toBe('game-1');
      expect(scene.startedTurn).toBe(1);
      expect(scene.status).toBe('active');
      expect(scene.name).toBeNull();
      expect(scene.description).toBeNull();
    });

    it('should create a scene with all fields', () => {
      const scene = repo.create({
        gameId: 'game-1',
        name: 'The Tavern Brawl',
        description: 'A fight breaks out in the tavern',
        sceneType: 'confrontation',
        locationId: 'area-1',
        startedTurn: 5,
        mood: 'tense',
        stakes: 'medium',
      });

      expect(scene.id).toBeDefined();
      expect(scene.name).toBe('The Tavern Brawl');
      expect(scene.description).toBe('A fight breaks out in the tavern');
      expect(scene.sceneType).toBe('confrontation');
      expect(scene.locationId).toBe('area-1');
      expect(scene.startedTurn).toBe(5);
      expect(scene.mood).toBe('tense');
      expect(scene.stakes).toBe('medium');
      expect(scene.status).toBe('active');
      expect(scene.completedTurn).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find a scene by ID', () => {
      const created = repo.create({
        gameId: 'game-1',
        name: 'Test Scene',
        startedTurn: 1,
      });

      const found = repo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe('Test Scene');
    });

    it('should return null for non-existent ID', () => {
      const found = repo.findById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findByGame', () => {
    beforeEach(() => {
      repo.create({ gameId: 'game-1', name: 'Scene 1', startedTurn: 1 });
      repo.create({ gameId: 'game-1', name: 'Scene 2', startedTurn: 5 });
      repo.create({ gameId: 'game-1', name: 'Scene 3', startedTurn: 3 });
    });

    it('should find all scenes for a game ordered by started_turn', () => {
      const scenes = repo.findByGame('game-1');
      expect(scenes).toHaveLength(3);
      expect(scenes[0].name).toBe('Scene 1');
      expect(scenes[1].name).toBe('Scene 3');
      expect(scenes[2].name).toBe('Scene 2');
    });

    it('should return empty array for game with no scenes', () => {
      db.exec(`
        INSERT INTO games (id, player_id, current_area_id, turn)
        VALUES ('game-2', 'player-2', 'area-1', 1)
      `);

      const scenes = repo.findByGame('game-2');
      expect(scenes).toHaveLength(0);
    });

    it('should respect limit and offset', () => {
      const scenes = repo.findByGame('game-1', { limit: 2, offset: 1 });
      expect(scenes).toHaveLength(2);
      expect(scenes[0].name).toBe('Scene 3');
      expect(scenes[1].name).toBe('Scene 2');
    });
  });

  describe('findActive', () => {
    it('should find the active scene for a game', () => {
      const scene1 = repo.create({ gameId: 'game-1', name: 'Completed', startedTurn: 1 });
      repo.completeScene(scene1.id, 4);
      repo.create({ gameId: 'game-1', name: 'Active', startedTurn: 5 });

      const active = repo.findActive('game-1');
      expect(active).not.toBeNull();
      expect(active!.name).toBe('Active');
      expect(active!.status).toBe('active');
    });

    it('should return null when no active scene exists', () => {
      const scene = repo.create({ gameId: 'game-1', name: 'Completed', startedTurn: 1 });
      repo.completeScene(scene.id, 4);

      const active = repo.findActive('game-1');
      expect(active).toBeNull();
    });
  });

  describe('findAvailable', () => {
    it('should find scenes that are available via scene_availability', () => {
      const scene1 = repo.create({ gameId: 'game-1', name: 'Available Scene', startedTurn: 1 });
      repo.create({ gameId: 'game-1', name: 'Unavailable Scene', startedTurn: 2 });

      // Add scene1 to scene_availability
      db.exec(`
        INSERT INTO scene_availability (game_id, scene_id, unlocked_turn)
        VALUES ('game-1', '${scene1.id}', 1)
      `);

      const available = repo.findAvailable('game-1');
      expect(available).toHaveLength(1);
      expect(available[0].name).toBe('Available Scene');
    });

    it('should not return completed scenes', () => {
      const scene = repo.create({ gameId: 'game-1', name: 'Completed Scene', startedTurn: 1 });
      repo.completeScene(scene.id, 5);

      db.exec(`
        INSERT INTO scene_availability (game_id, scene_id, unlocked_turn)
        VALUES ('game-1', '${scene.id}', 1)
      `);

      const available = repo.findAvailable('game-1');
      expect(available).toHaveLength(0);
    });
  });

  describe('startScene', () => {
    it('should set status to active and record started_turn', () => {
      // Create scene without starting it (directly insert as pending)
      db.exec(`
        INSERT INTO scenes (id, game_id, name, started_turn, status, created_at, updated_at)
        VALUES ('scene-pending', 'game-1', 'Pending Scene', 0, 'active', datetime('now'), datetime('now'))
      `);

      repo.startScene('scene-pending', 3);

      const scene = repo.findById('scene-pending');
      expect(scene!.status).toBe('active');
      expect(scene!.startedTurn).toBe(3);
    });
  });

  describe('completeScene', () => {
    it('should set status to completed and record completed_turn', () => {
      const scene = repo.create({ gameId: 'game-1', name: 'Test', startedTurn: 1 });

      repo.completeScene(scene.id, 10);

      const completed = repo.findById(scene.id);
      expect(completed!.status).toBe('completed');
      expect(completed!.completedTurn).toBe(10);
    });
  });

  describe('abandonScene', () => {
    it('should set status to abandoned', () => {
      const scene = repo.create({ gameId: 'game-1', name: 'Test', startedTurn: 1 });

      repo.abandonScene(scene.id);

      const abandoned = repo.findById(scene.id);
      expect(abandoned!.status).toBe('abandoned');
    });
  });

  describe('update', () => {
    it('should update scene metadata', () => {
      const scene = repo.create({ gameId: 'game-1', name: 'Original', startedTurn: 1 });

      repo.update(scene.id, {
        name: 'Updated',
        description: 'New description',
        mood: 'peaceful',
      });

      const updated = repo.findById(scene.id);
      expect(updated!.name).toBe('Updated');
      expect(updated!.description).toBe('New description');
      expect(updated!.mood).toBe('peaceful');
    });

    it('should not modify unspecified fields', () => {
      const scene = repo.create({
        gameId: 'game-1',
        name: 'Original',
        mood: 'tense',
        startedTurn: 1,
      });

      repo.update(scene.id, { name: 'Updated' });

      const updated = repo.findById(scene.id);
      expect(updated!.name).toBe('Updated');
      expect(updated!.mood).toBe('tense');
    });
  });

  describe('getEventsInScene', () => {
    beforeEach(() => {
      // Create events
      db.exec(`
        INSERT INTO events (id, game_id, turn, event_type, content, location_id, timestamp)
        VALUES
          ('event-1', 'game-1', 1, 'narration', 'Event 1', 'area-1', '2024-01-01T01:00:00Z'),
          ('event-2', 'game-1', 2, 'narration', 'Event 2', 'area-1', '2024-01-01T02:00:00Z'),
          ('event-3', 'game-1', 3, 'narration', 'Event 3', 'area-1', '2024-01-01T03:00:00Z'),
          ('event-4', 'game-1', 4, 'narration', 'Event 4', 'area-1', '2024-01-01T04:00:00Z'),
          ('event-5', 'game-1', 5, 'narration', 'Event 5', 'area-1', '2024-01-01T05:00:00Z')
      `);
    });

    it('should get events within a completed scene turn range', () => {
      const scene = repo.create({ gameId: 'game-1', name: 'Test', startedTurn: 2 });
      repo.completeScene(scene.id, 4);

      const events = repo.getEventsInScene(scene.id);
      expect(events).toHaveLength(3);
      expect(events[0].content).toBe('Event 2');
      expect(events[1].content).toBe('Event 3');
      expect(events[2].content).toBe('Event 4');
    });

    it('should get all events from started_turn onwards for active scene', () => {
      const scene = repo.create({ gameId: 'game-1', name: 'Active', startedTurn: 3 });

      const events = repo.getEventsInScene(scene.id);
      expect(events).toHaveLength(3);
      expect(events[0].content).toBe('Event 3');
      expect(events[1].content).toBe('Event 4');
      expect(events[2].content).toBe('Event 5');
    });

    it('should return empty array for non-existent scene', () => {
      const events = repo.getEventsInScene('non-existent');
      expect(events).toHaveLength(0);
    });
  });

  describe('countEventsInScene', () => {
    beforeEach(() => {
      db.exec(`
        INSERT INTO events (id, game_id, turn, event_type, content, location_id, timestamp)
        VALUES
          ('event-1', 'game-1', 1, 'narration', 'Event 1', 'area-1', '2024-01-01T01:00:00Z'),
          ('event-2', 'game-1', 2, 'narration', 'Event 2', 'area-1', '2024-01-01T02:00:00Z'),
          ('event-3', 'game-1', 3, 'narration', 'Event 3', 'area-1', '2024-01-01T03:00:00Z')
      `);
    });

    it('should count events in scene', () => {
      const scene = repo.create({ gameId: 'game-1', name: 'Test', startedTurn: 1 });
      repo.completeScene(scene.id, 2);

      const count = repo.countEventsInScene(scene.id);
      expect(count).toBe(2);
    });

    it('should return 0 for non-existent scene', () => {
      const count = repo.countEventsInScene('non-existent');
      expect(count).toBe(0);
    });
  });

  describe('findByStatus', () => {
    beforeEach(() => {
      const scene1 = repo.create({ gameId: 'game-1', name: 'Active 1', startedTurn: 1 });
      const scene2 = repo.create({ gameId: 'game-1', name: 'Completed', startedTurn: 2 });
      repo.completeScene(scene2.id, 3);
      const scene3 = repo.create({ gameId: 'game-1', name: 'Abandoned', startedTurn: 4 });
      repo.abandonScene(scene3.id);
    });

    it('should find scenes by status', () => {
      const active = repo.findByStatus('game-1', 'active');
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe('Active 1');

      const completed = repo.findByStatus('game-1', 'completed');
      expect(completed).toHaveLength(1);
      expect(completed[0].name).toBe('Completed');

      const abandoned = repo.findByStatus('game-1', 'abandoned');
      expect(abandoned).toHaveLength(1);
      expect(abandoned[0].name).toBe('Abandoned');
    });
  });

  describe('findByLocation', () => {
    beforeEach(() => {
      db.exec(`
        INSERT INTO areas (id, name, description)
        VALUES ('area-2', 'Second Area', 'Another area')
      `);

      repo.create({ gameId: 'game-1', name: 'At Area 1', locationId: 'area-1', startedTurn: 1 });
      repo.create({ gameId: 'game-1', name: 'At Area 2', locationId: 'area-2', startedTurn: 2 });
      repo.create({ gameId: 'game-1', name: 'Also Area 1', locationId: 'area-1', startedTurn: 3 });
    });

    it('should find scenes by location', () => {
      const area1Scenes = repo.findByLocation('game-1', 'area-1');
      expect(area1Scenes).toHaveLength(2);

      const area2Scenes = repo.findByLocation('game-1', 'area-2');
      expect(area2Scenes).toHaveLength(1);
      expect(area2Scenes[0].name).toBe('At Area 2');
    });
  });

  describe('delete', () => {
    it('should delete a scene', () => {
      const scene = repo.create({ gameId: 'game-1', name: 'Test', startedTurn: 1 });

      repo.delete(scene.id);

      const found = repo.findById(scene.id);
      expect(found).toBeNull();
    });
  });
});
