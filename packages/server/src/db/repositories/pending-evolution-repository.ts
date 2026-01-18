import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { EntityType } from './relationship-repository.js';

/**
 * Evolution types that can be suggested
 */
export type EvolutionType = 'trait_add' | 'trait_remove' | 'relationship_change';

/**
 * Resolution status for pending evolutions
 */
export type EvolutionStatus = 'pending' | 'approved' | 'edited' | 'refused';

/**
 * Relationship dimensions that can change
 */
export type RelationshipDimension = 'trust' | 'respect' | 'affection' | 'fear' | 'resentment' | 'debt';

/**
 * Base pending evolution record
 */
export interface PendingEvolution {
  id: string;
  gameId: string;
  turn: number;
  evolutionType: EvolutionType;
  entityType: EntityType;
  entityId: string;
  trait?: string;
  targetType?: EntityType;
  targetId?: string;
  dimension?: RelationshipDimension;
  oldValue?: number;
  newValue?: number;
  reason: string;
  sourceEventId?: string;
  status: EvolutionStatus;
  dmNotes?: string;
  createdAt: string;
  resolvedAt?: string;
}

/**
 * Input for creating a trait evolution
 */
export interface CreateTraitEvolutionInput {
  gameId: string;
  turn: number;
  evolutionType: 'trait_add' | 'trait_remove';
  entityType: EntityType;
  entityId: string;
  trait: string;
  reason: string;
  sourceEventId?: string;
}

/**
 * Input for creating a relationship evolution
 */
export interface CreateRelationshipEvolutionInput {
  gameId: string;
  turn: number;
  evolutionType: 'relationship_change';
  entityType: EntityType;
  entityId: string;
  targetType: EntityType;
  targetId: string;
  dimension: RelationshipDimension;
  oldValue: number;
  newValue: number;
  reason: string;
  sourceEventId?: string;
}

/**
 * Union type for all evolution creation inputs
 */
export type CreateEvolutionInput = CreateTraitEvolutionInput | CreateRelationshipEvolutionInput;

/**
 * Input for resolving a pending evolution
 */
export interface ResolveEvolutionInput {
  status: 'approved' | 'edited' | 'refused';
  dmNotes?: string;
}

/**
 * Input for updating a pending evolution
 */
export interface UpdateEvolutionInput {
  trait?: string;
  targetType?: EntityType;
  targetId?: string;
  dimension?: RelationshipDimension;
  oldValue?: number;
  newValue?: number;
  reason?: string;
  dmNotes?: string;
}

/**
 * Repository for managing pending evolution suggestions
 * Queues evolution suggestions for DM review before application
 */
export class PendingEvolutionRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create a new pending evolution
   */
  create(input: CreateEvolutionInput): PendingEvolution {
    const id = randomUUID();
    const now = new Date().toISOString();

    if (input.evolutionType === 'relationship_change') {
      const relInput = input as CreateRelationshipEvolutionInput;
      this.db.prepare(`
        INSERT INTO pending_evolutions (
          id, game_id, turn, evolution_type, entity_type, entity_id,
          target_type, target_id, dimension, old_value, new_value,
          reason, source_event_id, status, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(
        id,
        relInput.gameId,
        relInput.turn,
        relInput.evolutionType,
        relInput.entityType,
        relInput.entityId,
        relInput.targetType,
        relInput.targetId,
        relInput.dimension,
        relInput.oldValue,
        relInput.newValue,
        relInput.reason,
        relInput.sourceEventId ?? null,
        now
      );

      const result: PendingEvolution = {
        id,
        gameId: relInput.gameId,
        turn: relInput.turn,
        evolutionType: relInput.evolutionType,
        entityType: relInput.entityType,
        entityId: relInput.entityId,
        targetType: relInput.targetType,
        targetId: relInput.targetId,
        dimension: relInput.dimension,
        oldValue: relInput.oldValue,
        newValue: relInput.newValue,
        reason: relInput.reason,
        status: 'pending',
        createdAt: now,
      };
      if (relInput.sourceEventId !== undefined) {
        result.sourceEventId = relInput.sourceEventId;
      }
      return result;
    }

    // Trait evolution
    const traitInput = input as CreateTraitEvolutionInput;
    this.db.prepare(`
      INSERT INTO pending_evolutions (
        id, game_id, turn, evolution_type, entity_type, entity_id,
        trait, reason, source_event_id, status, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      id,
      traitInput.gameId,
      traitInput.turn,
      traitInput.evolutionType,
      traitInput.entityType,
      traitInput.entityId,
      traitInput.trait,
      traitInput.reason,
      traitInput.sourceEventId ?? null,
      now
    );

    const traitResult: PendingEvolution = {
      id,
      gameId: traitInput.gameId,
      turn: traitInput.turn,
      evolutionType: traitInput.evolutionType,
      entityType: traitInput.entityType,
      entityId: traitInput.entityId,
      trait: traitInput.trait,
      reason: traitInput.reason,
      status: 'pending',
      createdAt: now,
    };
    if (traitInput.sourceEventId !== undefined) {
      traitResult.sourceEventId = traitInput.sourceEventId;
    }
    return traitResult;
  }

  /**
   * Find a pending evolution by ID
   */
  findById(id: string): PendingEvolution | null {
    const row = this.db.prepare(`
      SELECT id, game_id, turn, evolution_type, entity_type, entity_id,
        trait, target_type, target_id, dimension, old_value, new_value,
        reason, source_event_id, status, dm_notes, created_at, resolved_at
      FROM pending_evolutions
      WHERE id = ?
    `).get(id) as PendingEvolutionRow | undefined;

    if (!row) return null;

    return this.rowToEvolution(row);
  }

  /**
   * Find all pending evolutions for a game
   * @param gameId - Game to find evolutions for
   * @param statusFilter - Optional status filter (defaults to 'pending')
   */
  findPending(gameId: string, statusFilter: EvolutionStatus = 'pending'): PendingEvolution[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, turn, evolution_type, entity_type, entity_id,
        trait, target_type, target_id, dimension, old_value, new_value,
        reason, source_event_id, status, dm_notes, created_at, resolved_at
      FROM pending_evolutions
      WHERE game_id = ? AND status = ?
      ORDER BY turn ASC, created_at ASC
    `).all(gameId, statusFilter) as PendingEvolutionRow[];

    return rows.map(row => this.rowToEvolution(row));
  }

  /**
   * Find all evolutions for a game regardless of status
   */
  findByGame(gameId: string): PendingEvolution[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, turn, evolution_type, entity_type, entity_id,
        trait, target_type, target_id, dimension, old_value, new_value,
        reason, source_event_id, status, dm_notes, created_at, resolved_at
      FROM pending_evolutions
      WHERE game_id = ?
      ORDER BY turn ASC, created_at ASC
    `).all(gameId) as PendingEvolutionRow[];

    return rows.map(row => this.rowToEvolution(row));
  }

  /**
   * Resolve a pending evolution (approve, edit, or refuse)
   */
  resolve(id: string, input: ResolveEvolutionInput): PendingEvolution | null {
    const now = new Date().toISOString();

    const result = this.db.prepare(`
      UPDATE pending_evolutions
      SET status = ?, dm_notes = ?, resolved_at = ?
      WHERE id = ?
    `).run(input.status, input.dmNotes ?? null, now, id);

    if (result.changes === 0) {
      return null;
    }

    return this.findById(id);
  }

  /**
   * Update a pending evolution's details
   */
  update(id: string, input: UpdateEvolutionInput): PendingEvolution | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updates = {
      trait: input.trait ?? existing.trait,
      targetType: input.targetType ?? existing.targetType,
      targetId: input.targetId ?? existing.targetId,
      dimension: input.dimension ?? existing.dimension,
      oldValue: input.oldValue ?? existing.oldValue,
      newValue: input.newValue ?? existing.newValue,
      reason: input.reason ?? existing.reason,
      dmNotes: input.dmNotes ?? existing.dmNotes,
    };

    this.db.prepare(`
      UPDATE pending_evolutions
      SET trait = ?, target_type = ?, target_id = ?, dimension = ?,
          old_value = ?, new_value = ?, reason = ?, dm_notes = ?
      WHERE id = ?
    `).run(
      updates.trait ?? null,
      updates.targetType ?? null,
      updates.targetId ?? null,
      updates.dimension ?? null,
      updates.oldValue ?? null,
      updates.newValue ?? null,
      updates.reason,
      updates.dmNotes ?? null,
      id
    );

    return this.findById(id);
  }

  /**
   * Delete a pending evolution
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM pending_evolutions WHERE id = ?').run(id);
  }

  /**
   * Delete all pending evolutions for a game
   */
  deleteByGame(gameId: string): void {
    this.db.prepare('DELETE FROM pending_evolutions WHERE game_id = ?').run(gameId);
  }

  /**
   * Find evolutions for a specific entity
   */
  findByEntity(gameId: string, entityType: EntityType, entityId: string): PendingEvolution[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, turn, evolution_type, entity_type, entity_id,
        trait, target_type, target_id, dimension, old_value, new_value,
        reason, source_event_id, status, dm_notes, created_at, resolved_at
      FROM pending_evolutions
      WHERE game_id = ? AND entity_type = ? AND entity_id = ?
      ORDER BY turn ASC, created_at ASC
    `).all(gameId, entityType, entityId) as PendingEvolutionRow[];

    return rows.map(row => this.rowToEvolution(row));
  }

  private rowToEvolution(row: PendingEvolutionRow): PendingEvolution {
    const result: PendingEvolution = {
      id: row.id,
      gameId: row.game_id,
      turn: row.turn,
      evolutionType: row.evolution_type as EvolutionType,
      entityType: row.entity_type as EntityType,
      entityId: row.entity_id,
      reason: row.reason,
      status: row.status as EvolutionStatus,
      createdAt: row.created_at,
    };

    if (row.trait !== null) {
      result.trait = row.trait;
    }
    if (row.target_type !== null) {
      result.targetType = row.target_type as EntityType;
    }
    if (row.target_id !== null) {
      result.targetId = row.target_id;
    }
    if (row.dimension !== null) {
      result.dimension = row.dimension as RelationshipDimension;
    }
    if (row.old_value !== null) {
      result.oldValue = row.old_value;
    }
    if (row.new_value !== null) {
      result.newValue = row.new_value;
    }
    if (row.source_event_id !== null) {
      result.sourceEventId = row.source_event_id;
    }
    if (row.dm_notes !== null) {
      result.dmNotes = row.dm_notes;
    }
    if (row.resolved_at !== null) {
      result.resolvedAt = row.resolved_at;
    }

    return result;
  }
}

interface PendingEvolutionRow {
  id: string;
  game_id: string;
  turn: number;
  evolution_type: string;
  entity_type: string;
  entity_id: string;
  trait: string | null;
  target_type: string | null;
  target_id: string | null;
  dimension: string | null;
  old_value: number | null;
  new_value: number | null;
  reason: string;
  source_event_id: string | null;
  status: string;
  dm_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}
