import type Database from 'better-sqlite3';
import type { Character, CharacterStats } from '@reckoning/shared/game';
import { randomUUID } from 'crypto';

/**
 * Character roles within a party
 */
export type CharacterRole = 'player' | 'member' | 'companion';

/**
 * Party composition limits
 */
export const PARTY_LIMITS = {
  player: 1,
  member: 2,
  companion: 2,
} as const;

/**
 * Character with role information
 */
export interface CharacterWithRole extends Character {
  role: CharacterRole;
  partyId: string;
}

/**
 * Input for creating a character
 */
export interface CreateCharacterInput {
  partyId: string;
  name: string;
  description?: string;
  class?: string;
  role: CharacterRole;
  stats?: CharacterStats;
  voiceId?: string;
}

/**
 * Repository for character CRUD operations
 * Enforces party limits: 1 player, 2 members, 2 companions
 */
export class CharacterRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create a new character
   * @throws Error if party limit for role would be exceeded
   */
  create(input: CreateCharacterInput): CharacterWithRole {
    // Check party limit before creating
    const currentCount = this.countByRole(input.partyId, input.role);
    const limit = PARTY_LIMITS[input.role];

    if (currentCount >= limit) {
      throw new Error(
        `Party limit exceeded: cannot have more than ${limit} ${input.role}(s)`
      );
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const stats = input.stats || { health: 100, maxHealth: 100 };

    this.db.prepare(`
      INSERT INTO characters (id, party_id, name, description, class, role, stats, voice_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.partyId,
      input.name,
      input.description || null,
      input.class || null,
      input.role,
      JSON.stringify(stats),
      input.voiceId || null,
      now,
      now
    );

    const result: CharacterWithRole = {
      id,
      partyId: input.partyId,
      name: input.name,
      description: input.description || '',
      class: input.class || '',
      role: input.role,
      stats,
    };
    if (input.voiceId) {
      result.voiceId = input.voiceId;
    }
    return result;
  }

  /**
   * Find a character by ID
   */
  findById(id: string): CharacterWithRole | null {
    const row = this.db.prepare(`
      SELECT id, party_id, name, description, class, role, stats, voice_id
      FROM characters WHERE id = ?
    `).get(id) as CharacterRow | undefined;

    if (!row) return null;

    return this.rowToCharacter(row);
  }

  /**
   * Find all characters in a party
   */
  findByParty(partyId: string): CharacterWithRole[] {
    const rows = this.db.prepare(`
      SELECT id, party_id, name, description, class, role, stats, voice_id
      FROM characters WHERE party_id = ?
    `).all(partyId) as CharacterRow[];

    return rows.map(row => this.rowToCharacter(row));
  }

  /**
   * Find characters in a party by role
   */
  findByPartyAndRole(partyId: string, role: CharacterRole): CharacterWithRole[] {
    const rows = this.db.prepare(`
      SELECT id, party_id, name, description, class, role, stats, voice_id
      FROM characters WHERE party_id = ? AND role = ?
    `).all(partyId, role) as CharacterRow[];

    return rows.map(row => this.rowToCharacter(row));
  }

  /**
   * Find the player character in a party
   */
  findPlayer(partyId: string): CharacterWithRole | null {
    const row = this.db.prepare(`
      SELECT id, party_id, name, description, class, role, stats, voice_id
      FROM characters WHERE party_id = ? AND role = 'player'
    `).get(partyId) as CharacterRow | undefined;

    if (!row) return null;

    return this.rowToCharacter(row);
  }

  /**
   * Count characters in a party by role
   */
  countByRole(partyId: string, role: CharacterRole): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM characters WHERE party_id = ? AND role = ?
    `).get(partyId, role) as { count: number };

    return result.count;
  }

  /**
   * Check if a party can add a character with the given role
   */
  canAddRole(partyId: string, role: CharacterRole): boolean {
    const currentCount = this.countByRole(partyId, role);
    return currentCount < PARTY_LIMITS[role];
  }

  /**
   * Get remaining slots for each role in a party
   */
  getRemainingSlots(partyId: string): Record<CharacterRole, number> {
    return {
      player: PARTY_LIMITS.player - this.countByRole(partyId, 'player'),
      member: PARTY_LIMITS.member - this.countByRole(partyId, 'member'),
      companion: PARTY_LIMITS.companion - this.countByRole(partyId, 'companion'),
    };
  }

  /**
   * Update a character
   */
  update(character: Partial<CharacterWithRole> & { id: string }): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (character.name !== undefined) {
      fields.push('name = ?');
      values.push(character.name);
    }
    if (character.description !== undefined) {
      fields.push('description = ?');
      values.push(character.description);
    }
    if (character.class !== undefined) {
      fields.push('class = ?');
      values.push(character.class);
    }
    if (character.stats !== undefined) {
      fields.push('stats = ?');
      values.push(JSON.stringify(character.stats));
    }
    if (character.voiceId !== undefined) {
      fields.push('voice_id = ?');
      values.push(character.voiceId);
    }
    // Note: role changes are not allowed via update to maintain party limits
    // Use changeRole() method instead if role changes are needed

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(character.id);

    this.db.prepare(`
      UPDATE characters SET ${fields.join(', ')} WHERE id = ?
    `).run(...values);
  }

  /**
   * Change a character's role (with limit enforcement)
   * @throws Error if party limit for new role would be exceeded
   */
  changeRole(id: string, newRole: CharacterRole): void {
    const character = this.findById(id);
    if (!character) {
      throw new Error(`Character not found: ${id}`);
    }

    if (character.role === newRole) return;

    // Check if new role has available slots
    if (!this.canAddRole(character.partyId, newRole)) {
      throw new Error(
        `Party limit exceeded: cannot have more than ${PARTY_LIMITS[newRole]} ${newRole}(s)`
      );
    }

    this.db.prepare(`
      UPDATE characters SET role = ?, updated_at = ? WHERE id = ?
    `).run(newRole, new Date().toISOString(), id);
  }

  /**
   * Delete a character
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM characters WHERE id = ?').run(id);
  }

  /**
   * Delete all characters in a party
   */
  deleteByParty(partyId: string): void {
    this.db.prepare('DELETE FROM characters WHERE party_id = ?').run(partyId);
  }

  private rowToCharacter(row: CharacterRow): CharacterWithRole {
    const stats = row.stats ? JSON.parse(row.stats) : { health: 100, maxHealth: 100 };

    const result: CharacterWithRole = {
      id: row.id,
      partyId: row.party_id,
      name: row.name,
      description: row.description || '',
      class: row.class || '',
      role: row.role as CharacterRole,
      stats,
    };
    if (row.voice_id) {
      result.voiceId = row.voice_id;
    }
    return result;
  }
}

interface CharacterRow {
  id: string;
  party_id: string;
  name: string;
  description: string | null;
  class: string | null;
  role: string;
  stats: string | null;
  voice_id: string | null;
}
