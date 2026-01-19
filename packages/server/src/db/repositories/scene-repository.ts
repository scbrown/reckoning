import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

/**
 * Scene status values
 */
export type SceneStatus = 'active' | 'completed' | 'abandoned';

/**
 * A scene grouping multiple turns into a narrative unit
 */
export interface Scene {
  id: string;
  gameId: string;
  name: string | null;
  description: string | null;
  sceneType: string | null;
  locationId: string | null;
  startedTurn: number;
  completedTurn: number | null;
  status: SceneStatus;
  mood: string | null;
  stakes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating a new scene
 */
export interface CreateSceneInput {
  gameId: string;
  name?: string;
  description?: string;
  sceneType?: string;
  locationId?: string;
  startedTurn: number;
  mood?: string;
  stakes?: string;
}

/**
 * Input for updating a scene
 */
export interface UpdateSceneInput {
  name?: string;
  description?: string;
  sceneType?: string;
  locationId?: string;
  mood?: string;
  stakes?: string;
}

/**
 * Event data returned by getEventsInScene
 */
export interface SceneEvent {
  id: string;
  gameId: string;
  turn: number;
  timestamp: string;
  eventType: string;
  content: string;
  locationId: string;
}

/**
 * Repository for scene CRUD operations
 */
export class SceneRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create a new scene
   */
  create(input: CreateSceneInput): Scene {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO scenes (
        id, game_id, name, description, scene_type, location_id,
        started_turn, status, mood, stakes, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(
      id,
      input.gameId,
      input.name || null,
      input.description || null,
      input.sceneType || null,
      input.locationId || null,
      input.startedTurn,
      input.mood || null,
      input.stakes || null,
      now,
      now
    );

    return this.findById(id)!;
  }

  /**
   * Find a scene by ID
   */
  findById(id: string): Scene | null {
    const row = this.db.prepare(`
      SELECT id, game_id, name, description, scene_type, location_id,
             started_turn, completed_turn, status, mood, stakes, created_at, updated_at
      FROM scenes WHERE id = ?
    `).get(id) as SceneRow | undefined;

    if (!row) return null;

    return this.rowToScene(row);
  }

  /**
   * Find all scenes for a game, ordered by started_turn
   */
  findByGame(gameId: string, options?: { limit?: number; offset?: number }): Scene[] {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const rows = this.db.prepare(`
      SELECT id, game_id, name, description, scene_type, location_id,
             started_turn, completed_turn, status, mood, stakes, created_at, updated_at
      FROM scenes WHERE game_id = ?
      ORDER BY started_turn ASC
      LIMIT ? OFFSET ?
    `).all(gameId, limit, offset) as SceneRow[];

    return rows.map(row => this.rowToScene(row));
  }

  /**
   * Find the currently active scene for a game
   */
  findActive(gameId: string): Scene | null {
    const row = this.db.prepare(`
      SELECT id, game_id, name, description, scene_type, location_id,
             started_turn, completed_turn, status, mood, stakes, created_at, updated_at
      FROM scenes WHERE game_id = ? AND status = 'active'
    `).get(gameId) as SceneRow | undefined;

    if (!row) return null;

    return this.rowToScene(row);
  }

  /**
   * Find available scenes for a game (scenes that are unlocked via scene_availability)
   * Returns scenes that are in scene_availability for this game and have status 'active' or haven't started yet
   */
  findAvailable(gameId: string): Scene[] {
    const rows = this.db.prepare(`
      SELECT s.id, s.game_id, s.name, s.description, s.scene_type, s.location_id,
             s.started_turn, s.completed_turn, s.status, s.mood, s.stakes, s.created_at, s.updated_at
      FROM scenes s
      JOIN scene_availability sa ON s.id = sa.scene_id AND s.game_id = sa.game_id
      WHERE s.game_id = ? AND s.status = 'active'
      ORDER BY sa.unlocked_turn ASC
    `).all(gameId) as SceneRow[];

    return rows.map(row => this.rowToScene(row));
  }

  /**
   * Start a scene by setting its status to active and recording the turn
   */
  startScene(sceneId: string, turn: number): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE scenes SET status = 'active', started_turn = ?, updated_at = ?
      WHERE id = ?
    `).run(turn, now, sceneId);
  }

  /**
   * Complete a scene by setting its status to completed and recording the end turn
   */
  completeScene(sceneId: string, turn: number): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE scenes SET status = 'completed', completed_turn = ?, updated_at = ?
      WHERE id = ?
    `).run(turn, now, sceneId);
  }

  /**
   * Abandon a scene
   */
  abandonScene(sceneId: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE scenes SET status = 'abandoned', updated_at = ?
      WHERE id = ?
    `).run(now, sceneId);
  }

  /**
   * Update a scene's metadata
   */
  update(id: string, input: UpdateSceneInput): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
      fields.push('name = ?');
      values.push(input.name);
    }
    if (input.description !== undefined) {
      fields.push('description = ?');
      values.push(input.description);
    }
    if (input.sceneType !== undefined) {
      fields.push('scene_type = ?');
      values.push(input.sceneType);
    }
    if (input.locationId !== undefined) {
      fields.push('location_id = ?');
      values.push(input.locationId);
    }
    if (input.mood !== undefined) {
      fields.push('mood = ?');
      values.push(input.mood);
    }
    if (input.stakes !== undefined) {
      fields.push('stakes = ?');
      values.push(input.stakes);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`
      UPDATE scenes SET ${fields.join(', ')} WHERE id = ?
    `).run(...values);
  }

  /**
   * Get all events that occurred during a scene
   */
  getEventsInScene(sceneId: string): SceneEvent[] {
    const scene = this.findById(sceneId);
    if (!scene) return [];

    // Build query based on whether scene is completed
    let query: string;
    let params: unknown[];

    if (scene.completedTurn !== null) {
      query = `
        SELECT id, game_id, turn, timestamp, event_type, content, location_id
        FROM events
        WHERE game_id = ? AND turn >= ? AND turn <= ?
        ORDER BY turn ASC, timestamp ASC
      `;
      params = [scene.gameId, scene.startedTurn, scene.completedTurn];
    } else {
      query = `
        SELECT id, game_id, turn, timestamp, event_type, content, location_id
        FROM events
        WHERE game_id = ? AND turn >= ?
        ORDER BY turn ASC, timestamp ASC
      `;
      params = [scene.gameId, scene.startedTurn];
    }

    const rows = this.db.prepare(query).all(...params) as EventRow[];

    return rows.map(row => ({
      id: row.id,
      gameId: row.game_id,
      turn: row.turn,
      timestamp: row.timestamp,
      eventType: row.event_type,
      content: row.content,
      locationId: row.location_id,
    }));
  }

  /**
   * Count events in a scene
   */
  countEventsInScene(sceneId: string): number {
    const scene = this.findById(sceneId);
    if (!scene) return 0;

    let query: string;
    let params: unknown[];

    if (scene.completedTurn !== null) {
      query = `
        SELECT COUNT(*) as count FROM events
        WHERE game_id = ? AND turn >= ? AND turn <= ?
      `;
      params = [scene.gameId, scene.startedTurn, scene.completedTurn];
    } else {
      query = `
        SELECT COUNT(*) as count FROM events
        WHERE game_id = ? AND turn >= ?
      `;
      params = [scene.gameId, scene.startedTurn];
    }

    const result = this.db.prepare(query).get(...params) as { count: number };
    return result.count;
  }

  /**
   * Find scenes by status
   */
  findByStatus(gameId: string, status: SceneStatus): Scene[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, name, description, scene_type, location_id,
             started_turn, completed_turn, status, mood, stakes, created_at, updated_at
      FROM scenes WHERE game_id = ? AND status = ?
      ORDER BY started_turn ASC
    `).all(gameId, status) as SceneRow[];

    return rows.map(row => this.rowToScene(row));
  }

  /**
   * Find scenes by location
   */
  findByLocation(gameId: string, locationId: string): Scene[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, name, description, scene_type, location_id,
             started_turn, completed_turn, status, mood, stakes, created_at, updated_at
      FROM scenes WHERE game_id = ? AND location_id = ?
      ORDER BY started_turn ASC
    `).all(gameId, locationId) as SceneRow[];

    return rows.map(row => this.rowToScene(row));
  }

  /**
   * Delete a scene
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM scenes WHERE id = ?').run(id);
  }

  private rowToScene(row: SceneRow): Scene {
    return {
      id: row.id,
      gameId: row.game_id,
      name: row.name,
      description: row.description,
      sceneType: row.scene_type,
      locationId: row.location_id,
      startedTurn: row.started_turn,
      completedTurn: row.completed_turn,
      status: row.status as SceneStatus,
      mood: row.mood,
      stakes: row.stakes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

interface SceneRow {
  id: string;
  game_id: string;
  name: string | null;
  description: string | null;
  scene_type: string | null;
  location_id: string | null;
  started_turn: number;
  completed_turn: number | null;
  status: string;
  mood: string | null;
  stakes: string | null;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  game_id: string;
  turn: number;
  timestamp: string;
  event_type: string;
  content: string;
  location_id: string;
}
