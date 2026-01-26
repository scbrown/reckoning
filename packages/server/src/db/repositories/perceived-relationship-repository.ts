import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

/**
 * Perceived relationship dimensions (visible to perceiver)
 * Note: fear/resentment are intentionally excluded as they are hidden
 */
export type PerceivedDimension = 'trust' | 'respect' | 'affection';

export const PERCEIVED_DIMENSIONS: readonly PerceivedDimension[] = [
  'trust', 'respect', 'affection'
] as const;

/**
 * Full perceived relationship record
 */
export interface PerceivedRelationship {
  id: string;
  gameId: string;
  perceiverId: string;
  targetId: string;
  perceivedTrust: number | null;
  perceivedRespect: number | null;
  perceivedAffection: number | null;
  lastUpdatedTurn: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating/updating a perceived relationship
 */
export interface UpsertPerceivedRelationshipInput {
  gameId: string;
  perceiverId: string;
  targetId: string;
  lastUpdatedTurn: number;
  perceivedTrust?: number | null;
  perceivedRespect?: number | null;
  perceivedAffection?: number | null;
}

/**
 * Repository for perceived relationship CRUD operations
 * Tracks how characters perceive relationships (may differ from truth)
 */
export class PerceivedRelationshipRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create or update a perceived relationship
   */
  upsert(input: UpsertPerceivedRelationshipInput): PerceivedRelationship {
    const existing = this.findByPerceiverAndTarget(input.gameId, input.perceiverId, input.targetId);
    const now = new Date().toISOString();

    if (existing) {
      // Update existing perceived relationship
      const updates = {
        perceivedTrust: input.perceivedTrust !== undefined ? input.perceivedTrust : existing.perceivedTrust,
        perceivedRespect: input.perceivedRespect !== undefined ? input.perceivedRespect : existing.perceivedRespect,
        perceivedAffection: input.perceivedAffection !== undefined ? input.perceivedAffection : existing.perceivedAffection,
        lastUpdatedTurn: input.lastUpdatedTurn,
        updatedAt: now,
      };

      this.db.prepare(`
        UPDATE perceived_relationships
        SET perceived_trust = ?, perceived_respect = ?, perceived_affection = ?,
            last_updated_turn = ?, updated_at = ?
        WHERE id = ?
      `).run(
        updates.perceivedTrust,
        updates.perceivedRespect,
        updates.perceivedAffection,
        updates.lastUpdatedTurn,
        updates.updatedAt,
        existing.id
      );

      return {
        ...existing,
        ...updates,
      };
    }

    // Create new perceived relationship
    const id = randomUUID();
    const perceivedTrust = input.perceivedTrust ?? null;
    const perceivedRespect = input.perceivedRespect ?? null;
    const perceivedAffection = input.perceivedAffection ?? null;

    this.db.prepare(`
      INSERT INTO perceived_relationships (
        id, game_id, perceiver_id, target_id,
        perceived_trust, perceived_respect, perceived_affection,
        last_updated_turn, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.gameId,
      input.perceiverId,
      input.targetId,
      perceivedTrust,
      perceivedRespect,
      perceivedAffection,
      input.lastUpdatedTurn,
      now,
      now
    );

    return {
      id,
      gameId: input.gameId,
      perceiverId: input.perceiverId,
      targetId: input.targetId,
      perceivedTrust,
      perceivedRespect,
      perceivedAffection,
      lastUpdatedTurn: input.lastUpdatedTurn,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Find perceived relationship by perceiver and target
   */
  findByPerceiverAndTarget(
    gameId: string,
    perceiverId: string,
    targetId: string
  ): PerceivedRelationship | null {
    const row = this.db.prepare(`
      SELECT id, game_id, perceiver_id, target_id,
        perceived_trust, perceived_respect, perceived_affection,
        last_updated_turn, created_at, updated_at
      FROM perceived_relationships
      WHERE game_id = ? AND perceiver_id = ? AND target_id = ?
    `).get(gameId, perceiverId, targetId) as PerceivedRelationshipRow | undefined;

    if (!row) return null;

    return this.rowToPerceivedRelationship(row);
  }

  /**
   * Find all perceived relationships for a perceiver
   */
  findByPerceiver(gameId: string, perceiverId: string): PerceivedRelationship[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, perceiver_id, target_id,
        perceived_trust, perceived_respect, perceived_affection,
        last_updated_turn, created_at, updated_at
      FROM perceived_relationships
      WHERE game_id = ? AND perceiver_id = ?
    `).all(gameId, perceiverId) as PerceivedRelationshipRow[];

    return rows.map(row => this.rowToPerceivedRelationship(row));
  }

  /**
   * Find all perceived relationships in a game
   */
  findByGame(gameId: string): PerceivedRelationship[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, perceiver_id, target_id,
        perceived_trust, perceived_respect, perceived_affection,
        last_updated_turn, created_at, updated_at
      FROM perceived_relationships
      WHERE game_id = ?
    `).all(gameId) as PerceivedRelationshipRow[];

    return rows.map(row => this.rowToPerceivedRelationship(row));
  }

  /**
   * Delete a perceived relationship
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM perceived_relationships WHERE id = ?').run(id);
  }

  /**
   * Delete all perceived relationships in a game
   */
  deleteByGame(gameId: string): void {
    this.db.prepare('DELETE FROM perceived_relationships WHERE game_id = ?').run(gameId);
  }

  /**
   * Delete all perceived relationships for a perceiver
   */
  deleteByPerceiver(gameId: string, perceiverId: string): void {
    this.db.prepare(`
      DELETE FROM perceived_relationships
      WHERE game_id = ? AND perceiver_id = ?
    `).run(gameId, perceiverId);
  }

  private rowToPerceivedRelationship(row: PerceivedRelationshipRow): PerceivedRelationship {
    return {
      id: row.id,
      gameId: row.game_id,
      perceiverId: row.perceiver_id,
      targetId: row.target_id,
      perceivedTrust: row.perceived_trust,
      perceivedRespect: row.perceived_respect,
      perceivedAffection: row.perceived_affection,
      lastUpdatedTurn: row.last_updated_turn,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

interface PerceivedRelationshipRow {
  id: string;
  game_id: string;
  perceiver_id: string;
  target_id: string;
  perceived_trust: number | null;
  perceived_respect: number | null;
  perceived_affection: number | null;
  last_updated_turn: number;
  created_at: string;
  updated_at: string;
}
