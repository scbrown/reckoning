import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

/**
 * Connection types defining how scenes are linked
 */
export type ConnectionType = 'path' | 'conditional' | 'hidden' | 'one-way' | 'teleport';

/**
 * Valid connection types for compile-time checking
 */
export const CONNECTION_TYPES: readonly ConnectionType[] = [
  'path', 'conditional', 'hidden', 'one-way', 'teleport'
] as const;

/**
 * Requirements for traversing a connection (stored as JSON)
 */
export interface ConnectionRequirements {
  items?: string[];
  flags?: string[];
  stats?: Record<string, number>;
}

/**
 * Full scene connection record
 */
export interface SceneConnection {
  id: string;
  gameId: string;
  fromSceneId: string;
  toSceneId: string;
  requirements: ConnectionRequirements | null;
  connectionType: ConnectionType;
  description: string | null;
  createdAt: string;
}

/**
 * Input for creating a scene connection
 */
export interface CreateSceneConnectionInput {
  gameId: string;
  fromSceneId: string;
  toSceneId: string;
  requirements?: ConnectionRequirements;
  connectionType?: ConnectionType;
  description?: string;
}

/**
 * Repository for scene connection CRUD operations
 * Manages navigation paths and transitions between scenes
 */
export class SceneConnectionRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create a new scene connection
   */
  create(input: CreateSceneConnectionInput): SceneConnection {
    const id = randomUUID();
    const now = new Date().toISOString();
    const connectionType = input.connectionType ?? 'path';
    const requirements = input.requirements ? JSON.stringify(input.requirements) : null;

    this.db.prepare(`
      INSERT INTO scene_connections (id, game_id, from_scene_id, to_scene_id, requirements, connection_type, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.gameId,
      input.fromSceneId,
      input.toSceneId,
      requirements,
      connectionType,
      input.description ?? null,
      now
    );

    return {
      id,
      gameId: input.gameId,
      fromSceneId: input.fromSceneId,
      toSceneId: input.toSceneId,
      requirements: input.requirements ?? null,
      connectionType,
      description: input.description ?? null,
      createdAt: now,
    };
  }

  /**
   * Find a connection by ID
   */
  findById(id: string): SceneConnection | null {
    const row = this.db.prepare(`
      SELECT id, game_id, from_scene_id, to_scene_id, requirements, connection_type, description, created_at
      FROM scene_connections
      WHERE id = ?
    `).get(id) as SceneConnectionRow | undefined;

    if (!row) return null;

    return this.rowToSceneConnection(row);
  }

  /**
   * Find all connections originating from a specific scene
   */
  findFromScene(gameId: string, sceneId: string): SceneConnection[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, from_scene_id, to_scene_id, requirements, connection_type, description, created_at
      FROM scene_connections
      WHERE game_id = ? AND from_scene_id = ?
    `).all(gameId, sceneId) as SceneConnectionRow[];

    return rows.map(row => this.rowToSceneConnection(row));
  }

  /**
   * Find all connections leading to a specific scene
   */
  findToScene(gameId: string, sceneId: string): SceneConnection[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, from_scene_id, to_scene_id, requirements, connection_type, description, created_at
      FROM scene_connections
      WHERE game_id = ? AND to_scene_id = ?
    `).all(gameId, sceneId) as SceneConnectionRow[];

    return rows.map(row => this.rowToSceneConnection(row));
  }

  /**
   * Get connections from a scene where the destination is unlocked
   * Joins with scene_availability to filter only traversable paths
   */
  getUnlockedConnections(gameId: string, fromSceneId: string): SceneConnection[] {
    const rows = this.db.prepare(`
      SELECT sc.id, sc.game_id, sc.from_scene_id, sc.to_scene_id, sc.requirements, sc.connection_type, sc.description, sc.created_at
      FROM scene_connections sc
      INNER JOIN scene_availability sa ON sc.to_scene_id = sa.scene_id AND sc.game_id = sa.game_id
      WHERE sc.game_id = ? AND sc.from_scene_id = ?
    `).all(gameId, fromSceneId) as SceneConnectionRow[];

    return rows.map(row => this.rowToSceneConnection(row));
  }

  /**
   * Delete a connection
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM scene_connections WHERE id = ?').run(id);
  }

  /**
   * Delete all connections in a game
   */
  deleteByGame(gameId: string): void {
    this.db.prepare('DELETE FROM scene_connections WHERE game_id = ?').run(gameId);
  }

  private rowToSceneConnection(row: SceneConnectionRow): SceneConnection {
    return {
      id: row.id,
      gameId: row.game_id,
      fromSceneId: row.from_scene_id,
      toSceneId: row.to_scene_id,
      requirements: row.requirements ? JSON.parse(row.requirements) : null,
      connectionType: row.connection_type as ConnectionType,
      description: row.description,
      createdAt: row.created_at,
    };
  }
}

interface SceneConnectionRow {
  id: string;
  game_id: string;
  from_scene_id: string;
  to_scene_id: string;
  requirements: string | null;
  connection_type: string;
  description: string | null;
  created_at: string;
}
