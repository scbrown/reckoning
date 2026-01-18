import type Database from 'better-sqlite3';
import type { CanonicalEvent, EventType, ActorType, TargetType } from '@reckoning/shared/game';
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
      INSERT INTO events (
        id, game_id, turn, timestamp, event_type, content, original_generated, speaker, location_id, witnesses,
        action, actor_type, actor_id, target_type, target_id, tags
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      JSON.stringify(event.witnesses),
      event.action || null,
      event.actorType || null,
      event.actorId || null,
      event.targetType || null,
      event.targetId || null,
      event.tags ? JSON.stringify(event.tags) : null
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
      SELECT id, game_id, turn, timestamp, event_type, content, original_generated, speaker, location_id, witnesses,
             action, actor_type, actor_id, target_type, target_id, tags
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
      SELECT id, game_id, turn, timestamp, event_type, content, original_generated, speaker, location_id, witnesses,
             action, actor_type, actor_id, target_type, target_id, tags
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
      SELECT id, game_id, turn, timestamp, event_type, content, original_generated, speaker, location_id, witnesses,
             action, actor_type, actor_id, target_type, target_id, tags
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
      SELECT id, game_id, turn, timestamp, event_type, content, original_generated, speaker, location_id, witnesses,
             action, actor_type, actor_id, target_type, target_id, tags
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

  /**
   * Find events by action verbs
   */
  findByActions(gameId: string, actions: string[], options?: { limit?: number; offset?: number }): CanonicalEvent[] {
    if (actions.length === 0) return [];

    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const placeholders = actions.map(() => '?').join(', ');

    const rows = this.db.prepare(`
      SELECT id, game_id, turn, timestamp, event_type, content, original_generated, speaker, location_id, witnesses,
             action, actor_type, actor_id, target_type, target_id, tags
      FROM events
      WHERE game_id = ? AND action IN (${placeholders})
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `).all(gameId, ...actions, limit, offset) as EventRow[];

    return rows.map(row => this.rowToEvent(row));
  }

  /**
   * Count events by action verbs
   */
  countByActions(gameId: string, actions: string[]): number {
    if (actions.length === 0) return 0;

    const placeholders = actions.map(() => '?').join(', ');

    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM events
      WHERE game_id = ? AND action IN (${placeholders})
    `).get(gameId, ...actions) as { count: number };

    return result.count;
  }

  /**
   * Find events by actor
   */
  findByActor(gameId: string, actorType: ActorType, actorId: string, options?: { limit?: number; offset?: number }): CanonicalEvent[] {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const rows = this.db.prepare(`
      SELECT id, game_id, turn, timestamp, event_type, content, original_generated, speaker, location_id, witnesses,
             action, actor_type, actor_id, target_type, target_id, tags
      FROM events
      WHERE game_id = ? AND actor_type = ? AND actor_id = ?
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `).all(gameId, actorType, actorId, limit, offset) as EventRow[];

    return rows.map(row => this.rowToEvent(row));
  }

  /**
   * Find events by target
   */
  findByTarget(gameId: string, targetType: TargetType, targetId: string, options?: { limit?: number; offset?: number }): CanonicalEvent[] {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const rows = this.db.prepare(`
      SELECT id, game_id, turn, timestamp, event_type, content, original_generated, speaker, location_id, witnesses,
             action, actor_type, actor_id, target_type, target_id, tags
      FROM events
      WHERE game_id = ? AND target_type = ? AND target_id = ?
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `).all(gameId, targetType, targetId, limit, offset) as EventRow[];

    return rows.map(row => this.rowToEvent(row));
  }

  /**
   * Find events witnessed by a specific entity
   * Uses JSON query to search the witnesses array
   */
  findWitnessedBy(gameId: string, witnessId: string, options?: { limit?: number; offset?: number }): CanonicalEvent[] {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const rows = this.db.prepare(`
      SELECT id, game_id, turn, timestamp, event_type, content, original_generated, speaker, location_id, witnesses,
             action, actor_type, actor_id, target_type, target_id, tags
      FROM events
      WHERE game_id = ? AND EXISTS (
        SELECT 1 FROM json_each(witnesses) WHERE value = ?
      )
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `).all(gameId, witnessId, limit, offset) as EventRow[];

    return rows.map(row => this.rowToEvent(row));
  }

  /**
   * Find events with a specific tag
   * Uses JSON query to search the tags array
   */
  findByTag(gameId: string, tag: string, options?: { limit?: number; offset?: number }): CanonicalEvent[] {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const rows = this.db.prepare(`
      SELECT id, game_id, turn, timestamp, event_type, content, original_generated, speaker, location_id, witnesses,
             action, actor_type, actor_id, target_type, target_id, tags
      FROM events
      WHERE game_id = ? AND tags IS NOT NULL AND EXISTS (
        SELECT 1 FROM json_each(tags) WHERE value = ?
      )
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `).all(gameId, tag, limit, offset) as EventRow[];

    return rows.map(row => this.rowToEvent(row));
  }

  /**
   * Get summary of action counts for a game
   * Returns a map of action -> count
   */
  getActionSummary(gameId: string): Map<string, number> {
    const rows = this.db.prepare(`
      SELECT action, COUNT(*) as count
      FROM events
      WHERE game_id = ? AND action IS NOT NULL
      GROUP BY action
      ORDER BY count DESC
    `).all(gameId) as { action: string; count: number }[];

    const summary = new Map<string, number>();
    for (const row of rows) {
      summary.set(row.action, row.count);
    }
    return summary;
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

    // Structured event fields (SEVT-001)
    if (row.action) {
      event.action = row.action;
    }
    if (row.actor_type) {
      event.actorType = row.actor_type as ActorType;
    }
    if (row.actor_id) {
      event.actorId = row.actor_id;
    }
    if (row.target_type) {
      event.targetType = row.target_type as TargetType;
    }
    if (row.target_id) {
      event.targetId = row.target_id;
    }
    if (row.tags) {
      event.tags = JSON.parse(row.tags);
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
  // Structured event fields (SEVT-001)
  action: string | null;
  actor_type: string | null;
  actor_id: string | null;
  target_type: string | null;
  target_id: string | null;
  tags: string | null;
}
