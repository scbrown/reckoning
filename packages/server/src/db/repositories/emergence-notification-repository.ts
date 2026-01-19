import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  EmergenceOpportunity,
  EmergenceAcknowledgmentStatus,
  EmergenceNotification,
} from '@reckoning/shared';

/**
 * Input for creating a new emergence notification
 */
export interface CreateEmergenceNotificationInput {
  gameId: string;
  opportunity: EmergenceOpportunity;
}

/**
 * Input for resolving (acknowledging/dismissing) a notification
 */
export interface ResolveNotificationInput {
  status: 'acknowledged' | 'dismissed';
  dmNotes?: string | undefined;
}

/**
 * Repository for managing emergence notifications for DM review
 */
export class EmergenceNotificationRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create a new emergence notification
   */
  create(input: CreateEmergenceNotificationInput): EmergenceNotification {
    const id = randomUUID();
    const now = new Date().toISOString();
    const opportunity = input.opportunity;

    this.db.prepare(`
      INSERT INTO emergence_notifications (
        id, game_id, emergence_type, entity_type, entity_id,
        confidence, reason, triggering_event_id, contributing_factors,
        status, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      id,
      input.gameId,
      opportunity.type,
      opportunity.entity.type,
      opportunity.entity.id,
      opportunity.confidence,
      opportunity.reason,
      opportunity.triggeringEventId,
      JSON.stringify(opportunity.contributingFactors),
      now
    );

    return {
      id,
      gameId: input.gameId,
      opportunity,
      status: 'pending',
      createdAt: now,
    };
  }

  /**
   * Find a notification by ID
   */
  findById(id: string): EmergenceNotification | null {
    const row = this.db.prepare(`
      SELECT id, game_id, emergence_type, entity_type, entity_id,
        confidence, reason, triggering_event_id, contributing_factors,
        status, dm_notes, created_at, resolved_at
      FROM emergence_notifications
      WHERE id = ?
    `).get(id) as EmergenceNotificationRow | undefined;

    if (!row) return null;

    return this.rowToNotification(row);
  }

  /**
   * Find all pending notifications for a game
   */
  findPending(gameId: string): EmergenceNotification[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, emergence_type, entity_type, entity_id,
        confidence, reason, triggering_event_id, contributing_factors,
        status, dm_notes, created_at, resolved_at
      FROM emergence_notifications
      WHERE game_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `).all(gameId) as EmergenceNotificationRow[];

    return rows.map(row => this.rowToNotification(row));
  }

  /**
   * Find all notifications for a game (regardless of status)
   */
  findByGame(gameId: string, limit?: number): EmergenceNotification[] {
    let query = `
      SELECT id, game_id, emergence_type, entity_type, entity_id,
        confidence, reason, triggering_event_id, contributing_factors,
        status, dm_notes, created_at, resolved_at
      FROM emergence_notifications
      WHERE game_id = ?
      ORDER BY created_at DESC
    `;

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const rows = this.db.prepare(query).all(gameId) as EmergenceNotificationRow[];

    return rows.map(row => this.rowToNotification(row));
  }

  /**
   * Resolve (acknowledge/dismiss) a notification
   */
  resolve(id: string, input: ResolveNotificationInput): EmergenceNotification | null {
    const now = new Date().toISOString();

    const result = this.db.prepare(`
      UPDATE emergence_notifications
      SET status = ?, dm_notes = ?, resolved_at = ?
      WHERE id = ?
    `).run(input.status, input.dmNotes ?? null, now, id);

    if (result.changes === 0) {
      return null;
    }

    return this.findById(id);
  }

  /**
   * Delete a notification
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM emergence_notifications WHERE id = ?').run(id);
  }

  /**
   * Delete all notifications for a game
   */
  deleteByGame(gameId: string): void {
    this.db.prepare('DELETE FROM emergence_notifications WHERE game_id = ?').run(gameId);
  }

  /**
   * Check if a similar notification already exists (to avoid duplicates)
   */
  existsSimilar(gameId: string, entityId: string, emergenceType: string): boolean {
    const row = this.db.prepare(`
      SELECT 1 FROM emergence_notifications
      WHERE game_id = ? AND entity_id = ? AND emergence_type = ? AND status = 'pending'
      LIMIT 1
    `).get(gameId, entityId, emergenceType);

    return row !== undefined;
  }

  private rowToNotification(row: EmergenceNotificationRow): EmergenceNotification {
    const contributingFactors = JSON.parse(row.contributing_factors);

    const notification: EmergenceNotification = {
      id: row.id,
      gameId: row.game_id,
      opportunity: {
        type: row.emergence_type as 'villain' | 'ally',
        entity: {
          type: row.entity_type as 'player' | 'npc' | 'location' | 'item',
          id: row.entity_id,
        },
        confidence: row.confidence,
        reason: row.reason,
        triggeringEventId: row.triggering_event_id,
        contributingFactors,
      },
      status: row.status as EmergenceAcknowledgmentStatus,
      createdAt: row.created_at,
    };

    if (row.dm_notes !== null) {
      notification.dmNotes = row.dm_notes;
    }
    if (row.resolved_at !== null) {
      notification.resolvedAt = row.resolved_at;
    }

    return notification;
  }
}

interface EmergenceNotificationRow {
  id: string;
  game_id: string;
  emergence_type: string;
  entity_type: string;
  entity_id: string;
  confidence: number;
  reason: string;
  triggering_event_id: string;
  contributing_factors: string;
  status: string;
  dm_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}
