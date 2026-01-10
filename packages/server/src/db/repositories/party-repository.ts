import type Database from 'better-sqlite3';
import type { Character } from '@reckoning/shared/game';
import { randomUUID } from 'crypto';

/**
 * Repository for party member operations
 */
export class PartyRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create party members for a game
   */
  create(gameId: string, members: Omit<Character, 'id'>[]): Character[] {
    const insertStmt = this.db.prepare(`
      INSERT INTO party_members (id, game_id, name, description, class, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    const createdMembers: Character[] = [];

    const insertMany = this.db.transaction(() => {
      for (const member of members) {
        const id = randomUUID();
        insertStmt.run(id, gameId, member.name, member.description, member.class, now);
        createdMembers.push({
          id,
          ...member,
        });
      }
    });

    insertMany();

    return createdMembers;
  }

  /**
   * Find all party members for a game
   */
  findByGame(gameId: string): Character[] {
    const rows = this.db.prepare(`
      SELECT id, name, description, class FROM party_members WHERE game_id = ?
    `).all(gameId) as PartyMemberRow[];

    return rows.map(row => this.rowToCharacter(row));
  }

  /**
   * Find a party member by ID
   */
  findById(id: string): Character | null {
    const row = this.db.prepare(`
      SELECT id, name, description, class FROM party_members WHERE id = ?
    `).get(id) as PartyMemberRow | undefined;

    if (!row) return null;

    return this.rowToCharacter(row);
  }

  /**
   * Update a party member
   */
  update(member: Partial<Character> & { id: string }): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (member.name !== undefined) {
      fields.push('name = ?');
      values.push(member.name);
    }
    if (member.description !== undefined) {
      fields.push('description = ?');
      values.push(member.description);
    }
    if (member.class !== undefined) {
      fields.push('class = ?');
      values.push(member.class);
    }

    if (fields.length === 0) return;

    values.push(member.id);

    this.db.prepare(`
      UPDATE party_members SET ${fields.join(', ')} WHERE id = ?
    `).run(...values);
  }

  /**
   * Delete a party member
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM party_members WHERE id = ?').run(id);
  }

  /**
   * Delete all party members for a game
   */
  deleteByGame(gameId: string): void {
    this.db.prepare('DELETE FROM party_members WHERE game_id = ?').run(gameId);
  }

  private rowToCharacter(row: PartyMemberRow): Character {
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      class: row.class || '',
      stats: { health: 100, maxHealth: 100 },
    };
  }
}

interface PartyMemberRow {
  id: string;
  name: string;
  description: string | null;
  class: string | null;
}
