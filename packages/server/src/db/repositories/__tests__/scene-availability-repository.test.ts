import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SceneAvailabilityRepository } from '../scene-availability-repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('SceneAvailabilityRepository', () => {
  let db: Database.Database;
  let repo: SceneAvailabilityRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create test game
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'default-area', 5)
    `);

    // Create test scenes
    db.exec(`
      INSERT INTO scenes (id, game_id, name, started_turn, status)
      VALUES
        ('scene-1', 'game-1', 'Opening', 1, 'completed'),
        ('scene-2', 'game-1', 'First Dungeon', 5, 'active'),
        ('scene-3', 'game-1', 'Hidden Chamber', 10, 'active')
    `);

    repo = new SceneAvailabilityRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('unlock', () => {
    it('should unlock a scene for a game', () => {
      const result = repo.unlock('game-1', 'scene-1', 1);

      expect(result.gameId).toBe('game-1');
      expect(result.sceneId).toBe('scene-1');
      expect(result.unlockedTurn).toBe(1);
      expect(result.unlockedBy).toBeNull();
      expect(result.createdAt).toBeDefined();
    });

    it('should unlock a scene with unlockedBy specified', () => {
      const result = repo.unlock('game-1', 'scene-1', 3, 'event-123');

      expect(result.unlockedBy).toBe('event-123');
    });

    it('should be idempotent - calling twice with same data returns existing record', () => {
      const first = repo.unlock('game-1', 'scene-1', 1, 'event-1');
      const second = repo.unlock('game-1', 'scene-1', 5, 'event-2');

      // Second call should not update the record
      expect(second.gameId).toBe(first.gameId);
      expect(second.sceneId).toBe(first.sceneId);
      expect(second.unlockedTurn).toBe(1); // Original turn preserved
      expect(second.unlockedBy).toBe('event-1'); // Original unlocker preserved
      expect(second.createdAt).toBe(first.createdAt);
    });

    it('should allow unlocking multiple scenes for same game', () => {
      repo.unlock('game-1', 'scene-1', 1);
      repo.unlock('game-1', 'scene-2', 5);

      const unlocked = repo.getUnlocked('game-1');
      expect(unlocked).toHaveLength(2);
    });
  });

  describe('isUnlocked', () => {
    it('should return true for unlocked scene', () => {
      repo.unlock('game-1', 'scene-1', 1);

      expect(repo.isUnlocked('game-1', 'scene-1')).toBe(true);
    });

    it('should return false for locked scene', () => {
      expect(repo.isUnlocked('game-1', 'scene-1')).toBe(false);
    });

    it('should return false for non-existent game', () => {
      expect(repo.isUnlocked('non-existent-game', 'scene-1')).toBe(false);
    });
  });

  describe('getUnlocked', () => {
    it('should return all unlocked scenes for a game', () => {
      repo.unlock('game-1', 'scene-1', 1);
      repo.unlock('game-1', 'scene-2', 5);

      const unlocked = repo.getUnlocked('game-1');

      expect(unlocked).toHaveLength(2);
      expect(unlocked[0].sceneId).toBe('scene-1');
      expect(unlocked[1].sceneId).toBe('scene-2');
    });

    it('should order by unlocked turn', () => {
      repo.unlock('game-1', 'scene-2', 5);
      repo.unlock('game-1', 'scene-1', 1);

      const unlocked = repo.getUnlocked('game-1');

      expect(unlocked[0].unlockedTurn).toBe(1);
      expect(unlocked[1].unlockedTurn).toBe(5);
    });

    it('should return empty array for game with no unlocked scenes', () => {
      const unlocked = repo.getUnlocked('game-1');
      expect(unlocked).toHaveLength(0);
    });

    it('should not return scenes from other games', () => {
      // Create second game
      db.exec(`
        INSERT INTO games (id, player_id, current_area_id, turn)
        VALUES ('game-2', 'player-2', 'default-area', 1)
      `);
      db.exec(`
        INSERT INTO scenes (id, game_id, name, started_turn, status)
        VALUES ('scene-4', 'game-2', 'Other Scene', 1, 'active')
      `);

      repo.unlock('game-1', 'scene-1', 1);
      repo.unlock('game-2', 'scene-4', 1);

      const game1Unlocked = repo.getUnlocked('game-1');
      expect(game1Unlocked).toHaveLength(1);
      expect(game1Unlocked[0].sceneId).toBe('scene-1');
    });
  });

  describe('getUnlockInfo', () => {
    it('should return unlock info for unlocked scene', () => {
      repo.unlock('game-1', 'scene-1', 3, 'event-xyz');

      const info = repo.getUnlockInfo('game-1', 'scene-1');

      expect(info).not.toBeNull();
      expect(info!.gameId).toBe('game-1');
      expect(info!.sceneId).toBe('scene-1');
      expect(info!.unlockedTurn).toBe(3);
      expect(info!.unlockedBy).toBe('event-xyz');
      expect(info!.createdAt).toBeDefined();
    });

    it('should return null for locked scene', () => {
      const info = repo.getUnlockInfo('game-1', 'scene-1');
      expect(info).toBeNull();
    });

    it('should return null for non-existent game/scene combo', () => {
      repo.unlock('game-1', 'scene-1', 1);

      expect(repo.getUnlockInfo('game-1', 'scene-2')).toBeNull();
      expect(repo.getUnlockInfo('non-existent', 'scene-1')).toBeNull();
    });
  });

  describe('lock', () => {
    it('should remove scene unlock', () => {
      repo.unlock('game-1', 'scene-1', 1);
      expect(repo.isUnlocked('game-1', 'scene-1')).toBe(true);

      const removed = repo.lock('game-1', 'scene-1');

      expect(removed).toBe(true);
      expect(repo.isUnlocked('game-1', 'scene-1')).toBe(false);
    });

    it('should return false when locking already locked scene', () => {
      const removed = repo.lock('game-1', 'scene-1');
      expect(removed).toBe(false);
    });

    it('should not affect other scenes', () => {
      repo.unlock('game-1', 'scene-1', 1);
      repo.unlock('game-1', 'scene-2', 5);

      repo.lock('game-1', 'scene-1');

      expect(repo.isUnlocked('game-1', 'scene-1')).toBe(false);
      expect(repo.isUnlocked('game-1', 'scene-2')).toBe(true);
    });
  });

  describe('lockAllForGame', () => {
    it('should remove all unlocks for a game', () => {
      repo.unlock('game-1', 'scene-1', 1);
      repo.unlock('game-1', 'scene-2', 5);

      const count = repo.lockAllForGame('game-1');

      expect(count).toBe(2);
      expect(repo.getUnlocked('game-1')).toHaveLength(0);
    });

    it('should not affect other games', () => {
      // Create second game
      db.exec(`
        INSERT INTO games (id, player_id, current_area_id, turn)
        VALUES ('game-2', 'player-2', 'default-area', 1)
      `);
      db.exec(`
        INSERT INTO scenes (id, game_id, name, started_turn, status)
        VALUES ('scene-4', 'game-2', 'Other Scene', 1, 'active')
      `);

      repo.unlock('game-1', 'scene-1', 1);
      repo.unlock('game-2', 'scene-4', 1);

      repo.lockAllForGame('game-1');

      expect(repo.getUnlocked('game-1')).toHaveLength(0);
      expect(repo.getUnlocked('game-2')).toHaveLength(1);
    });

    it('should return 0 when no unlocks exist', () => {
      const count = repo.lockAllForGame('game-1');
      expect(count).toBe(0);
    });
  });

  describe('countUnlocked', () => {
    it('should return count of unlocked scenes', () => {
      expect(repo.countUnlocked('game-1')).toBe(0);

      repo.unlock('game-1', 'scene-1', 1);
      expect(repo.countUnlocked('game-1')).toBe(1);

      repo.unlock('game-1', 'scene-2', 5);
      expect(repo.countUnlocked('game-1')).toBe(2);
    });

    it('should return 0 for non-existent game', () => {
      expect(repo.countUnlocked('non-existent')).toBe(0);
    });
  });

  describe('cascade delete', () => {
    it('should delete unlocks when game is deleted', () => {
      repo.unlock('game-1', 'scene-1', 1);
      repo.unlock('game-1', 'scene-2', 5);

      expect(repo.countUnlocked('game-1')).toBe(2);

      db.exec(`DELETE FROM games WHERE id = 'game-1'`);

      expect(repo.countUnlocked('game-1')).toBe(0);
    });

    it('should delete unlocks when scene is deleted', () => {
      repo.unlock('game-1', 'scene-1', 1);
      repo.unlock('game-1', 'scene-2', 5);

      expect(repo.countUnlocked('game-1')).toBe(2);

      db.exec(`DELETE FROM scenes WHERE id = 'scene-1'`);

      expect(repo.countUnlocked('game-1')).toBe(1);
      expect(repo.isUnlocked('game-1', 'scene-1')).toBe(false);
      expect(repo.isUnlocked('game-1', 'scene-2')).toBe(true);
    });
  });
});
