import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

/**
 * Entity types that can have relationships
 */
export type EntityType = 'player' | 'character' | 'npc' | 'location';

/**
 * Relationship dimensions (0.0 to 1.0)
 */
export type RelationshipDimension = 'trust' | 'respect' | 'affection' | 'fear' | 'resentment' | 'debt';

/**
 * Valid dimension values for compile-time checking
 */
export const RELATIONSHIP_DIMENSIONS: readonly RelationshipDimension[] = [
  'trust', 'respect', 'affection', 'fear', 'resentment', 'debt'
] as const;

/**
 * Default values for each dimension
 */
export const DIMENSION_DEFAULTS: Record<RelationshipDimension, number> = {
  trust: 0.5,
  respect: 0.5,
  affection: 0.5,
  fear: 0.0,
  resentment: 0.0,
  debt: 0.0,
};

/**
 * Entity reference (type + id pair)
 */
export interface Entity {
  type: EntityType;
  id: string;
}

/**
 * Full relationship record
 */
export interface Relationship {
  id: string;
  gameId: string;
  from: Entity;
  to: Entity;
  trust: number;
  respect: number;
  affection: number;
  fear: number;
  resentment: number;
  debt: number;
  updatedTurn: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating/updating a relationship
 */
export interface UpsertRelationshipInput {
  gameId: string;
  from: Entity;
  to: Entity;
  updatedTurn: number;
  trust?: number;
  respect?: number;
  affection?: number;
  fear?: number;
  resentment?: number;
  debt?: number;
}

/**
 * Threshold comparison operators
 */
export type ThresholdOperator = '>=' | '<=' | '>' | '<';

/**
 * Repository for relationship CRUD operations
 * Tracks multi-dimensional relationships between entities
 */
export class RelationshipRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create or update a relationship
   * Uses INSERT OR REPLACE based on unique constraint
   */
  upsert(input: UpsertRelationshipInput): Relationship {
    const existing = this.findBetween(input.gameId, input.from, input.to);
    const now = new Date().toISOString();

    if (existing) {
      // Update existing relationship
      const updates = {
        trust: input.trust ?? existing.trust,
        respect: input.respect ?? existing.respect,
        affection: input.affection ?? existing.affection,
        fear: input.fear ?? existing.fear,
        resentment: input.resentment ?? existing.resentment,
        debt: input.debt ?? existing.debt,
        updatedTurn: input.updatedTurn,
        updatedAt: now,
      };

      this.db.prepare(`
        UPDATE relationships
        SET trust = ?, respect = ?, affection = ?, fear = ?, resentment = ?, debt = ?,
            updated_turn = ?, updated_at = ?
        WHERE id = ?
      `).run(
        updates.trust,
        updates.respect,
        updates.affection,
        updates.fear,
        updates.resentment,
        updates.debt,
        updates.updatedTurn,
        updates.updatedAt,
        existing.id
      );

      return {
        ...existing,
        ...updates,
      };
    }

    // Create new relationship
    const id = randomUUID();
    const trust = input.trust ?? DIMENSION_DEFAULTS.trust;
    const respect = input.respect ?? DIMENSION_DEFAULTS.respect;
    const affection = input.affection ?? DIMENSION_DEFAULTS.affection;
    const fear = input.fear ?? DIMENSION_DEFAULTS.fear;
    const resentment = input.resentment ?? DIMENSION_DEFAULTS.resentment;
    const debt = input.debt ?? DIMENSION_DEFAULTS.debt;

    this.db.prepare(`
      INSERT INTO relationships (id, game_id, from_type, from_id, to_type, to_id,
        trust, respect, affection, fear, resentment, debt, updated_turn, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.gameId,
      input.from.type,
      input.from.id,
      input.to.type,
      input.to.id,
      trust,
      respect,
      affection,
      fear,
      resentment,
      debt,
      input.updatedTurn,
      now,
      now
    );

    return {
      id,
      gameId: input.gameId,
      from: input.from,
      to: input.to,
      trust,
      respect,
      affection,
      fear,
      resentment,
      debt,
      updatedTurn: input.updatedTurn,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Find relationship between two specific entities
   */
  findBetween(gameId: string, from: Entity, to: Entity): Relationship | null {
    const row = this.db.prepare(`
      SELECT id, game_id, from_type, from_id, to_type, to_id,
        trust, respect, affection, fear, resentment, debt,
        updated_turn, created_at, updated_at
      FROM relationships
      WHERE game_id = ? AND from_type = ? AND from_id = ? AND to_type = ? AND to_id = ?
    `).get(gameId, from.type, from.id, to.type, to.id) as RelationshipRow | undefined;

    if (!row) return null;

    return this.rowToRelationship(row);
  }

  /**
   * Find a relationship by ID
   */
  findById(id: string): Relationship | null {
    const row = this.db.prepare(`
      SELECT id, game_id, from_type, from_id, to_type, to_id,
        trust, respect, affection, fear, resentment, debt,
        updated_turn, created_at, updated_at
      FROM relationships
      WHERE id = ?
    `).get(id) as RelationshipRow | undefined;

    if (!row) return null;

    return this.rowToRelationship(row);
  }

  /**
   * Find all relationships involving an entity (as either 'from' or 'to')
   */
  findByEntity(gameId: string, entity: Entity): Relationship[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, from_type, from_id, to_type, to_id,
        trust, respect, affection, fear, resentment, debt,
        updated_turn, created_at, updated_at
      FROM relationships
      WHERE game_id = ? AND (
        (from_type = ? AND from_id = ?) OR
        (to_type = ? AND to_id = ?)
      )
    `).all(gameId, entity.type, entity.id, entity.type, entity.id) as RelationshipRow[];

    return rows.map(row => this.rowToRelationship(row));
  }

  /**
   * Find relationships where a dimension meets a threshold
   * @param gameId - Game to search in
   * @param dimension - Which dimension to check
   * @param threshold - Value to compare against (0.0 to 1.0)
   * @param operator - Comparison operator (>=, <=, >, <)
   */
  findByThreshold(
    gameId: string,
    dimension: RelationshipDimension,
    threshold: number,
    operator: ThresholdOperator = '>='
  ): Relationship[] {
    // Validate dimension to prevent SQL injection
    if (!RELATIONSHIP_DIMENSIONS.includes(dimension)) {
      throw new Error(`Invalid dimension: ${dimension}`);
    }

    // Validate operator
    const validOperators = ['>=', '<=', '>', '<'];
    if (!validOperators.includes(operator)) {
      throw new Error(`Invalid operator: ${operator}`);
    }

    const rows = this.db.prepare(`
      SELECT id, game_id, from_type, from_id, to_type, to_id,
        trust, respect, affection, fear, resentment, debt,
        updated_turn, created_at, updated_at
      FROM relationships
      WHERE game_id = ? AND ${dimension} ${operator} ?
    `).all(gameId, threshold) as RelationshipRow[];

    return rows.map(row => this.rowToRelationship(row));
  }

  /**
   * Update a specific dimension of a relationship
   */
  updateDimension(
    id: string,
    dimension: RelationshipDimension,
    value: number,
    updatedTurn: number
  ): Relationship | null {
    // Validate dimension
    if (!RELATIONSHIP_DIMENSIONS.includes(dimension)) {
      throw new Error(`Invalid dimension: ${dimension}`);
    }

    // Validate value is in valid range
    if (value < 0.0 || value > 1.0) {
      throw new Error(`Dimension value must be between 0.0 and 1.0, got: ${value}`);
    }

    const now = new Date().toISOString();

    const result = this.db.prepare(`
      UPDATE relationships
      SET ${dimension} = ?, updated_turn = ?, updated_at = ?
      WHERE id = ?
    `).run(value, updatedTurn, now, id);

    if (result.changes === 0) {
      return null;
    }

    return this.findById(id);
  }

  /**
   * Delete a relationship
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM relationships WHERE id = ?').run(id);
  }

  /**
   * Find all relationships in a game
   */
  findByGame(gameId: string): Relationship[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, from_type, from_id, to_type, to_id,
        trust, respect, affection, fear, resentment, debt,
        updated_turn, created_at, updated_at
      FROM relationships
      WHERE game_id = ?
    `).all(gameId) as RelationshipRow[];

    return rows.map(row => this.rowToRelationship(row));
  }

  /**
   * Delete all relationships in a game
   */
  deleteByGame(gameId: string): void {
    this.db.prepare('DELETE FROM relationships WHERE game_id = ?').run(gameId);
  }

  /**
   * Delete all relationships involving an entity
   */
  deleteByEntity(gameId: string, entity: Entity): void {
    this.db.prepare(`
      DELETE FROM relationships
      WHERE game_id = ? AND (
        (from_type = ? AND from_id = ?) OR
        (to_type = ? AND to_id = ?)
      )
    `).run(gameId, entity.type, entity.id, entity.type, entity.id);
  }

  private rowToRelationship(row: RelationshipRow): Relationship {
    return {
      id: row.id,
      gameId: row.game_id,
      from: {
        type: row.from_type as EntityType,
        id: row.from_id,
      },
      to: {
        type: row.to_type as EntityType,
        id: row.to_id,
      },
      trust: row.trust,
      respect: row.respect,
      affection: row.affection,
      fear: row.fear,
      resentment: row.resentment,
      debt: row.debt,
      updatedTurn: row.updated_turn,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

interface RelationshipRow {
  id: string;
  game_id: string;
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  trust: number;
  respect: number;
  affection: number;
  fear: number;
  resentment: number;
  debt: number;
  updated_turn: number;
  created_at: string;
  updated_at: string;
}
