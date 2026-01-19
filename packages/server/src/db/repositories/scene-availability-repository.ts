import type Database from 'better-sqlite3';

/**
 * Scene unlock information
 */
export interface SceneUnlockInfo {
  gameId: string;
  sceneId: string;
  unlockedTurn: number;
  unlockedBy: string | null;
  createdAt: string;
}

/**
 * Repository for scene availability/unlock tracking
 */
export class SceneAvailabilityRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Unlock a scene for a game
   * Idempotent: calling multiple times with the same gameId/sceneId is safe
   * and will not update existing records
   */
  unlock(
    gameId: string,
    sceneId: string,
    turn: number,
    unlockedBy?: string
  ): SceneUnlockInfo {
    const now = new Date().toISOString();

    // Use INSERT OR IGNORE for idempotent unlock
    // If record already exists, this is a no-op
    this.db.prepare(`
      INSERT OR IGNORE INTO scene_availability (game_id, scene_id, unlocked_turn, unlocked_by, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(gameId, sceneId, turn, unlockedBy ?? null, now);

    // Return the existing or newly created record
    return this.getUnlockInfo(gameId, sceneId)!;
  }

  /**
   * Check if a scene is unlocked for a game
   */
  isUnlocked(gameId: string, sceneId: string): boolean {
    const row = this.db.prepare(`
      SELECT 1 FROM scene_availability
      WHERE game_id = ? AND scene_id = ?
      LIMIT 1
    `).get(gameId, sceneId);

    return row !== undefined;
  }

  /**
   * Get all unlocked scenes for a game
   */
  getUnlocked(gameId: string): SceneUnlockInfo[] {
    const rows = this.db.prepare(`
      SELECT game_id, scene_id, unlocked_turn, unlocked_by, created_at
      FROM scene_availability
      WHERE game_id = ?
      ORDER BY unlocked_turn ASC, created_at ASC
    `).all(gameId) as SceneAvailabilityRow[];

    return rows.map(row => this.rowToUnlockInfo(row));
  }

  /**
   * Get unlock info for a specific scene
   * Returns null if the scene is not unlocked
   */
  getUnlockInfo(gameId: string, sceneId: string): SceneUnlockInfo | null {
    const row = this.db.prepare(`
      SELECT game_id, scene_id, unlocked_turn, unlocked_by, created_at
      FROM scene_availability
      WHERE game_id = ? AND scene_id = ?
    `).get(gameId, sceneId) as SceneAvailabilityRow | undefined;

    if (!row) return null;

    return this.rowToUnlockInfo(row);
  }

  /**
   * Remove scene unlock (lock a scene)
   */
  lock(gameId: string, sceneId: string): boolean {
    const result = this.db.prepare(`
      DELETE FROM scene_availability
      WHERE game_id = ? AND scene_id = ?
    `).run(gameId, sceneId);

    return result.changes > 0;
  }

  /**
   * Remove all scene unlocks for a game
   */
  lockAllForGame(gameId: string): number {
    const result = this.db.prepare(`
      DELETE FROM scene_availability
      WHERE game_id = ?
    `).run(gameId);

    return result.changes;
  }

  /**
   * Count unlocked scenes for a game
   */
  countUnlocked(gameId: string): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM scene_availability
      WHERE game_id = ?
    `).get(gameId) as { count: number };

    return result.count;
  }

  private rowToUnlockInfo(row: SceneAvailabilityRow): SceneUnlockInfo {
    return {
      gameId: row.game_id,
      sceneId: row.scene_id,
      unlockedTurn: row.unlocked_turn,
      unlockedBy: row.unlocked_by,
      createdAt: row.created_at,
    };
  }
}

interface SceneAvailabilityRow {
  game_id: string;
  scene_id: string;
  unlocked_turn: number;
  unlocked_by: string | null;
  created_at: string;
}
