import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

/**
 * A save slot with metadata
 */
export interface SaveSlot {
  id: string;
  gameId: string;
  name: string;
  turn: number;
  sessionDurationMs: number;
  createdAt: string;
}

/**
 * Repository for save/load slot operations
 */
export class SaveRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Save a game state snapshot
   */
  save(gameId: string, name: string, snapshot: object): SaveSlot {
    const id = randomUUID();
    const now = new Date().toISOString();

    // Get current turn from game
    const gameRow = this.db.prepare('SELECT turn FROM games WHERE id = ?').get(gameId) as { turn: number } | undefined;
    const turn = gameRow?.turn ?? 0;

    // Calculate session duration (could be passed in, but we'll estimate from first event)
    const firstEvent = this.db.prepare(`
      SELECT timestamp FROM events WHERE game_id = ? ORDER BY timestamp ASC LIMIT 1
    `).get(gameId) as { timestamp: string } | undefined;

    let sessionDurationMs = 0;
    if (firstEvent) {
      sessionDurationMs = new Date().getTime() - new Date(firstEvent.timestamp).getTime();
    }

    this.db.prepare(`
      INSERT INTO saves (id, game_id, name, turn, session_duration_ms, snapshot, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, gameId, name, turn, sessionDurationMs, JSON.stringify(snapshot), now);

    return {
      id,
      gameId,
      name,
      turn,
      sessionDurationMs,
      createdAt: now,
    };
  }

  /**
   * Load a save slot and its snapshot
   */
  load(saveId: string): { slot: SaveSlot; snapshot: object } | null {
    const row = this.db.prepare(`
      SELECT id, game_id, name, turn, session_duration_ms, snapshot, created_at
      FROM saves WHERE id = ?
    `).get(saveId) as SaveRow | undefined;

    if (!row) return null;

    return {
      slot: this.rowToSlot(row),
      snapshot: JSON.parse(row.snapshot),
    };
  }

  /**
   * List all save slots, optionally filtered by game
   */
  list(gameId?: string): SaveSlot[] {
    let rows: SaveRow[];

    if (gameId) {
      rows = this.db.prepare(`
        SELECT id, game_id, name, turn, session_duration_ms, snapshot, created_at
        FROM saves WHERE game_id = ?
        ORDER BY created_at DESC
      `).all(gameId) as SaveRow[];
    } else {
      rows = this.db.prepare(`
        SELECT id, game_id, name, turn, session_duration_ms, snapshot, created_at
        FROM saves
        ORDER BY created_at DESC
      `).all() as SaveRow[];
    }

    return rows.map(row => this.rowToSlot(row));
  }

  /**
   * Delete a save slot
   */
  delete(saveId: string): void {
    this.db.prepare('DELETE FROM saves WHERE id = ?').run(saveId);
  }

  /**
   * Find a save slot by name
   */
  findByName(name: string): SaveSlot | null {
    const row = this.db.prepare(`
      SELECT id, game_id, name, turn, session_duration_ms, snapshot, created_at
      FROM saves WHERE name = ?
    `).get(name) as SaveRow | undefined;

    if (!row) return null;

    return this.rowToSlot(row);
  }

  private rowToSlot(row: SaveRow): SaveSlot {
    return {
      id: row.id,
      gameId: row.game_id,
      name: row.name,
      turn: row.turn,
      sessionDurationMs: row.session_duration_ms ?? 0,
      createdAt: row.created_at,
    };
  }
}

interface SaveRow {
  id: string;
  game_id: string;
  name: string;
  turn: number;
  session_duration_ms: number | null;
  snapshot: string;
  created_at: string;
}
