import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

/**
 * Entity types that can have traits
 */
export type EntityType = 'player' | 'character' | 'npc' | 'location';

/**
 * Trait status values
 */
export type TraitStatus = 'active' | 'faded' | 'removed';

/**
 * Trait category for catalog entries
 */
export type TraitCategory = 'moral' | 'emotional' | 'capability' | 'reputation';

/**
 * Entity trait record
 */
export interface EntityTrait {
  id: string;
  gameId: string;
  entityType: EntityType;
  entityId: string;
  trait: string;
  acquiredTurn: number;
  sourceEventId?: string;
  status: TraitStatus;
  createdAt: string;
}

/**
 * Input for adding a trait
 */
export interface AddTraitInput {
  gameId: string;
  entityType: EntityType;
  entityId: string;
  trait: string;
  turn: number;
  sourceEventId?: string;
}

/**
 * Catalog entry for predefined traits
 */
export interface TraitCatalogEntry {
  trait: string;
  category: TraitCategory;
  description: string;
  opposites: string[];
}

/**
 * Database row type for entity_traits table
 */
interface EntityTraitRow {
  id: string;
  game_id: string;
  entity_type: string;
  entity_id: string;
  trait: string;
  acquired_turn: number;
  source_event_id: string | null;
  status: string;
  created_at: string;
}

/**
 * Predefined trait catalog
 * 24 traits across 4 categories: Moral, Emotional, Capability, Reputation
 */
const TRAIT_CATALOG: TraitCatalogEntry[] = [
  // Moral traits
  { trait: 'honorable', category: 'moral', description: 'Keeps promises, fights fairly', opposites: ['ruthless', 'deceitful'] },
  { trait: 'ruthless', category: 'moral', description: 'Will do anything to achieve goals', opposites: ['honorable', 'merciful'] },
  { trait: 'merciful', category: 'moral', description: 'Shows compassion to enemies', opposites: ['ruthless', 'cruel'] },
  { trait: 'pragmatic', category: 'moral', description: 'Prioritizes practical outcomes', opposites: ['idealistic'] },
  { trait: 'idealistic', category: 'moral', description: 'Holds to principles despite cost', opposites: ['pragmatic', 'corruptible'] },
  { trait: 'corruptible', category: 'moral', description: 'Can be swayed from principles', opposites: ['idealistic', 'honorable'] },

  // Emotional traits
  { trait: 'haunted', category: 'emotional', description: 'Troubled by past events', opposites: ['serene'] },
  { trait: 'hopeful', category: 'emotional', description: 'Believes in positive outcomes', opposites: ['bitter', 'cynical'] },
  { trait: 'bitter', category: 'emotional', description: 'Resentful of past wrongs', opposites: ['hopeful', 'serene'] },
  { trait: 'serene', category: 'emotional', description: 'At peace despite circumstances', opposites: ['volatile', 'haunted'] },
  { trait: 'volatile', category: 'emotional', description: 'Prone to sudden emotional shifts', opposites: ['serene', 'guarded'] },
  { trait: 'guarded', category: 'emotional', description: 'Keeps emotions hidden', opposites: ['volatile'] },

  // Capability traits
  { trait: 'battle-hardened', category: 'capability', description: 'Experienced in combat', opposites: ['naive'] },
  { trait: 'scholarly', category: 'capability', description: 'Well-read and knowledgeable', opposites: [] },
  { trait: 'street-wise', category: 'capability', description: 'Knows how to survive', opposites: ['naive'] },
  { trait: 'naive', category: 'capability', description: 'Inexperienced with the world', opposites: ['street-wise', 'battle-hardened'] },
  { trait: 'cunning', category: 'capability', description: 'Clever and strategic', opposites: [] },
  { trait: 'broken', category: 'capability', description: 'Damaged by experiences', opposites: [] },

  // Reputation traits
  { trait: 'feared', category: 'reputation', description: 'Others are afraid', opposites: ['beloved'] },
  { trait: 'beloved', category: 'reputation', description: 'Others feel affection', opposites: ['feared', 'notorious'] },
  { trait: 'notorious', category: 'reputation', description: 'Known for bad deeds', opposites: ['beloved', 'mysterious'] },
  { trait: 'mysterious', category: 'reputation', description: 'Little is known about them', opposites: ['notorious', 'legendary'] },
  { trait: 'disgraced', category: 'reputation', description: 'Fallen from honor', opposites: ['legendary'] },
  { trait: 'legendary', category: 'reputation', description: 'Known for great deeds', opposites: ['disgraced', 'mysterious'] },
];

/**
 * Repository for entity trait CRUD operations
 */
export class TraitRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Add a trait to an entity
   * @throws Error if trait already exists for this entity (unique constraint)
   */
  addTrait(input: AddTraitInput): EntityTrait {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO entity_traits (id, game_id, entity_type, entity_id, trait, acquired_turn, source_event_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      id,
      input.gameId,
      input.entityType,
      input.entityId,
      input.trait,
      input.turn,
      input.sourceEventId || null,
      now
    );

    const result: EntityTrait = {
      id,
      gameId: input.gameId,
      entityType: input.entityType,
      entityId: input.entityId,
      trait: input.trait,
      acquiredTurn: input.turn,
      status: 'active',
      createdAt: now,
    };
    if (input.sourceEventId) {
      result.sourceEventId = input.sourceEventId;
    }
    return result;
  }

  /**
   * Remove a trait from an entity (sets status to 'removed')
   */
  removeTrait(gameId: string, entityType: EntityType, entityId: string, trait: string): void {
    this.db.prepare(`
      UPDATE entity_traits
      SET status = 'removed'
      WHERE game_id = ? AND entity_type = ? AND entity_id = ? AND trait = ?
    `).run(gameId, entityType, entityId, trait);
  }

  /**
   * Find all active traits for an entity
   */
  findByEntity(gameId: string, entityType: EntityType, entityId: string): EntityTrait[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, entity_type, entity_id, trait, acquired_turn, source_event_id, status, created_at
      FROM entity_traits
      WHERE game_id = ? AND entity_type = ? AND entity_id = ? AND status = 'active'
      ORDER BY acquired_turn ASC
    `).all(gameId, entityType, entityId) as EntityTraitRow[];

    return rows.map(row => this.rowToTrait(row));
  }

  /**
   * Find all entities with a specific trait (active only)
   */
  findByTrait(gameId: string, trait: string): EntityTrait[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, entity_type, entity_id, trait, acquired_turn, source_event_id, status, created_at
      FROM entity_traits
      WHERE game_id = ? AND trait = ? AND status = 'active'
      ORDER BY acquired_turn ASC
    `).all(gameId, trait) as EntityTraitRow[];

    return rows.map(row => this.rowToTrait(row));
  }

  /**
   * Get full trait history for an entity (including faded/removed)
   */
  getTraitHistory(gameId: string, entityType: EntityType, entityId: string): EntityTrait[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, entity_type, entity_id, trait, acquired_turn, source_event_id, status, created_at
      FROM entity_traits
      WHERE game_id = ? AND entity_type = ? AND entity_id = ?
      ORDER BY acquired_turn ASC
    `).all(gameId, entityType, entityId) as EntityTraitRow[];

    return rows.map(row => this.rowToTrait(row));
  }

  /**
   * Get the predefined trait catalog
   */
  getTraitCatalog(): TraitCatalogEntry[] {
    return TRAIT_CATALOG;
  }

  /**
   * Get trait catalog entries by category
   */
  getTraitsByCategory(category: TraitCategory): TraitCatalogEntry[] {
    return TRAIT_CATALOG.filter(t => t.category === category);
  }

  /**
   * Find a trait by ID
   */
  findById(id: string): EntityTrait | null {
    const row = this.db.prepare(`
      SELECT id, game_id, entity_type, entity_id, trait, acquired_turn, source_event_id, status, created_at
      FROM entity_traits
      WHERE id = ?
    `).get(id) as EntityTraitRow | undefined;

    if (!row) return null;

    return this.rowToTrait(row);
  }

  /**
   * Check if an entity has a specific trait (active only)
   */
  hasTrait(gameId: string, entityType: EntityType, entityId: string, trait: string): boolean {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM entity_traits
      WHERE game_id = ? AND entity_type = ? AND entity_id = ? AND trait = ? AND status = 'active'
    `).get(gameId, entityType, entityId, trait) as { count: number };

    return result.count > 0;
  }

  /**
   * Update a trait's status
   */
  updateStatus(id: string, status: TraitStatus): void {
    this.db.prepare(`
      UPDATE entity_traits SET status = ? WHERE id = ?
    `).run(status, id);
  }

  /**
   * Delete a trait permanently
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM entity_traits WHERE id = ?').run(id);
  }

  /**
   * Delete all traits for a game (used when deleting a game)
   */
  deleteByGame(gameId: string): void {
    this.db.prepare('DELETE FROM entity_traits WHERE game_id = ?').run(gameId);
  }

  /**
   * Delete all traits for an entity
   */
  deleteByEntity(gameId: string, entityType: EntityType, entityId: string): void {
    this.db.prepare(`
      DELETE FROM entity_traits WHERE game_id = ? AND entity_type = ? AND entity_id = ?
    `).run(gameId, entityType, entityId);
  }

  /**
   * Count active traits for an entity
   */
  countByEntity(gameId: string, entityType: EntityType, entityId: string): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM entity_traits
      WHERE game_id = ? AND entity_type = ? AND entity_id = ? AND status = 'active'
    `).get(gameId, entityType, entityId) as { count: number };

    return result.count;
  }

  /**
   * Find all traits for a game (active only)
   */
  findByGame(gameId: string): EntityTrait[] {
    const rows = this.db.prepare(`
      SELECT id, game_id, entity_type, entity_id, trait, acquired_turn, source_event_id, status, created_at
      FROM entity_traits
      WHERE game_id = ? AND status = 'active'
      ORDER BY acquired_turn ASC
    `).all(gameId) as EntityTraitRow[];

    return rows.map(row => this.rowToTrait(row));
  }

  private rowToTrait(row: EntityTraitRow): EntityTrait {
    const result: EntityTrait = {
      id: row.id,
      gameId: row.game_id,
      entityType: row.entity_type as EntityType,
      entityId: row.entity_id,
      trait: row.trait,
      acquiredTurn: row.acquired_turn,
      status: row.status as TraitStatus,
      createdAt: row.created_at,
    };
    if (row.source_event_id) {
      result.sourceEventId = row.source_event_id;
    }
    return result;
  }
}
