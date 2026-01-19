import type Database from 'better-sqlite3';
import type { GameState, GameSession, PlaybackMode, Character, Area, AreaExit, AreaObject, NPC, NPCDisposition } from '@reckoning/shared/game';
import { randomUUID } from 'crypto';

/**
 * Repository for game CRUD operations
 */
export class GameRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create a new game
   */
  create(playerId: string, startAreaId: string): GameState {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO games (id, player_id, current_area_id, turn, playback_mode, created_at, updated_at)
      VALUES (?, ?, ?, 0, 'auto', ?, ?)
    `).run(id, playerId, startAreaId, now, now);

    return {
      id,
      playerId,
      currentAreaId: startAreaId,
      turn: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Find a game by ID
   */
  findById(id: string): GameState | null {
    const row = this.db.prepare(`
      SELECT id, player_id, current_area_id, turn, created_at, updated_at
      FROM games WHERE id = ?
    `).get(id) as GameRow | undefined;

    if (!row) return null;

    return this.rowToGameState(row);
  }

  /**
   * Update a game
   */
  update(game: Partial<GameState> & { id: string }): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (game.playerId !== undefined) {
      fields.push('player_id = ?');
      values.push(game.playerId);
    }
    if (game.currentAreaId !== undefined) {
      fields.push('current_area_id = ?');
      values.push(game.currentAreaId);
    }
    if (game.turn !== undefined) {
      fields.push('turn = ?');
      values.push(game.turn);
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(game.id);

    this.db.prepare(`
      UPDATE games SET ${fields.join(', ')} WHERE id = ?
    `).run(...values);
  }

  /**
   * Delete a game
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM games WHERE id = ?').run(id);
  }

  /**
   * Set the playback mode for a game
   */
  setPlaybackMode(id: string, mode: PlaybackMode): void {
    this.db.prepare(`
      UPDATE games SET playback_mode = ?, updated_at = ? WHERE id = ?
    `).run(mode, new Date().toISOString(), id);
  }

  /**
   * Get the current playback mode for a game
   */
  getPlaybackMode(id: string): PlaybackMode | null {
    const row = this.db.prepare('SELECT playback_mode FROM games WHERE id = ?').get(id) as { playback_mode: string } | undefined;
    return row ? (row.playback_mode as PlaybackMode) : null;
  }

  /**
   * Set the current scene for a game
   */
  setCurrentSceneId(id: string, sceneId: string | null): void {
    this.db.prepare(`
      UPDATE games SET current_scene_id = ?, updated_at = ? WHERE id = ?
    `).run(sceneId, new Date().toISOString(), id);
  }

  /**
   * Get the current scene ID for a game
   */
  getCurrentSceneId(id: string): string | null {
    const row = this.db.prepare('SELECT current_scene_id FROM games WHERE id = ?').get(id) as { current_scene_id: string | null } | undefined;
    return row?.current_scene_id ?? null;
  }

  /**
   * Increment the turn counter and return the new value
   */
  incrementTurn(id: string): number {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE games SET turn = turn + 1, updated_at = ? WHERE id = ?
    `).run(now, id);

    const row = this.db.prepare('SELECT turn FROM games WHERE id = ?').get(id) as { turn: number } | undefined;
    return row?.turn ?? 0;
  }

  /**
   * Get a full game session with related data
   */
  getSession(id: string): GameSession | null {
    const gameRow = this.db.prepare(`
      SELECT id, player_id, current_area_id, turn, created_at, updated_at
      FROM games WHERE id = ?
    `).get(id) as GameRow | undefined;

    if (!gameRow) return null;

    // Get player
    const playerRow = this.db.prepare(`
      SELECT id, name, description FROM players WHERE game_id = ?
    `).get(id) as { id: string; name: string; description: string | null } | undefined;

    if (!playerRow) return null;

    const player: Character = {
      id: playerRow.id,
      name: playerRow.name,
      description: playerRow.description || '',
      class: '',
      stats: { health: 100, maxHealth: 100 },
    };

    // Get current area with details
    const currentArea = this.getAreaWithDetails(gameRow.current_area_id);
    if (!currentArea) return null;

    // Get recent events
    const eventRows = this.db.prepare(`
      SELECT content FROM events WHERE game_id = ? ORDER BY timestamp DESC LIMIT 10
    `).all(id) as { content: string }[];

    const recentEvents = eventRows.map(e => e.content).reverse();

    return {
      state: this.rowToGameState(gameRow),
      player,
      currentArea,
      recentEvents,
    };
  }

  private getAreaWithDetails(areaId: string): Area | null {
    const areaRow = this.db.prepare(`
      SELECT id, name, description, tags FROM areas WHERE id = ?
    `).get(areaId) as { id: string; name: string; description: string; tags: string | null } | undefined;

    if (!areaRow) return null;

    // Get exits
    const exitRows = this.db.prepare(`
      SELECT direction, target_area_id, description, locked FROM area_exits WHERE area_id = ?
    `).all(areaId) as { direction: string; target_area_id: string; description: string | null; locked: number }[];

    const exits: AreaExit[] = exitRows.map(e => ({
      direction: e.direction,
      targetAreaId: e.target_area_id,
      description: e.description || '',
      locked: e.locked === 1,
    }));

    // Get objects
    const objectRows = this.db.prepare(`
      SELECT id, name, description, interactable, tags FROM area_objects WHERE area_id = ?
    `).all(areaId) as { id: string; name: string; description: string | null; interactable: number; tags: string | null }[];

    const objects: AreaObject[] = objectRows.map(o => ({
      id: o.id,
      name: o.name,
      description: o.description || '',
      interactable: o.interactable === 1,
      tags: o.tags ? JSON.parse(o.tags) : [],
    }));

    // Get NPCs
    const npcRows = this.db.prepare(`
      SELECT id, name, description, current_area_id, disposition, tags FROM npcs WHERE current_area_id = ?
    `).all(areaId) as { id: string; name: string; description: string | null; current_area_id: string; disposition: string; tags: string | null }[];

    const npcs: NPC[] = npcRows.map(n => ({
      id: n.id,
      name: n.name,
      description: n.description || '',
      currentAreaId: n.current_area_id,
      disposition: n.disposition as NPCDisposition,
      tags: n.tags ? JSON.parse(n.tags) : [],
    }));

    return {
      id: areaRow.id,
      name: areaRow.name,
      description: areaRow.description,
      exits,
      objects,
      npcs,
      tags: areaRow.tags ? JSON.parse(areaRow.tags) : [],
    };
  }

  private rowToGameState(row: GameRow): GameState {
    return {
      id: row.id,
      playerId: row.player_id,
      currentAreaId: row.current_area_id,
      turn: row.turn,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

interface GameRow {
  id: string;
  player_id: string;
  current_area_id: string;
  turn: number;
  created_at: string;
  updated_at: string;
}
