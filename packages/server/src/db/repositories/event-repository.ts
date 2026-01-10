import type Database from 'better-sqlite3';
import type { CanonicalEvent, EventType } from '@reckoning/shared/game';
import { randomUUID } from 'crypto';

/**
 * Repository for event history operations
 */
export class EventRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create a new event
   */
  create(event: Omit<CanonicalEvent, 'id' | 'timestamp'>): CanonicalEvent {
    const id = randomUUID();
    const timestamp = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO events (id, game_id, turn, timestamp, event_type, content, original_generated, speaker, location_id, witnesses)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      event.gameId,
      event.turn,
      timestamp,
      event.eventType,
      event.content,
      event.originalGenerated || null,
      event.speaker || null,
      event.locationId,
      JSON.stringify(event.witnesses)
    );

    return {
      id,
      timestamp,
      ...event,
    };
  }

  /**
   * Find an event by ID
   */
  findById(id: string): CanonicalEvent | null {
    const row = this.db.prepare(`
      SELECT id, game_id, turn, timestamp, event_type, content, original_generated, speaker, location_id, witnesses
      FROM events WHERE id = ?
    `).get(id) as EventRow | undefined;

    if (!row) return null;

    return this.rowToEvent(row);
  }

  /**
   * Find events by game ID
   */
  findByGame(gameId: string, options?: { limit?: number; offset?: number }): CanonicalEvent[] {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const rows = this.db.prepare(`
      SELECT id, game_id, turn, timestamp, event_type, content, original_generated, speaker, location_id, witnesses
      FROM events WHERE game_id = ?
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `).all(gameId, limit, offset) as EventRow[];

    return rows.map(row => this.rowToEvent(row));
  }

  /**
   * Find events by game and turn
   */
  findByTurn(gameId: string, turn: number): CanonicalEvent[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, turn, timestamp, event_type, content, original_generated, speaker, location_id, witnesses
      FROM events WHERE game_id = ? AND turn = ?
      ORDER BY timestamp ASC
    `).all(gameId, turn) as EventRow[];

    return rows.map(row => this.rowToEvent(row));
  }

  /**
   * Get recent events for context building
   */
  getRecentContext(gameId: string, limit: number = 10): CanonicalEvent[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, turn, timestamp, event_type, content, original_generated, speaker, location_id, witnesses
      FROM events WHERE game_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(gameId, limit) as EventRow[];

    return rows.map(row => this.rowToEvent(row)).reverse();
  }

  /**
   * Count events for a game
   */
  countByGame(gameId: string): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM events WHERE game_id = ?
    `).get(gameId) as { count: number };

    return result.count;
  }

  /**
   * Count events for a specific turn
   */
  countByTurn(gameId: string, turn: number): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM events WHERE game_id = ? AND turn = ?
    `).get(gameId, turn) as { count: number };

    return result.count;
  }

  private rowToEvent(row: EventRow): CanonicalEvent {
    const event: CanonicalEvent = {
      id: row.id,
      gameId: row.game_id,
      turn: row.turn,
      timestamp: row.timestamp,
      eventType: row.event_type as EventType,
      content: row.content,
      locationId: row.location_id,
      witnesses: row.witnesses ? JSON.parse(row.witnesses) : [],
    };

    if (row.original_generated) {
      event.originalGenerated = row.original_generated;
    }
    if (row.speaker) {
      event.speaker = row.speaker;
    }

    return event;
  }
}

interface EventRow {
  id: string;
  game_id: string;
  turn: number;
  timestamp: string;
  event_type: string;
  content: string;
  original_generated: string | null;
  speaker: string | null;
  location_id: string;
  witnesses: string | null;
}
