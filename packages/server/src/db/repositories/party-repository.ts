import type Database from 'better-sqlite3';
import type { Party, Character, CharacterStats } from '@reckoning/shared/game';
import { randomUUID } from 'crypto';

/**
 * Character role within a party
 * Role limits enforced: 1 player, 2 members, 2 companions
 */
export type CharacterRole = 'player' | 'member' | 'companion';

/**
 * Input for creating a character
 */
export interface CreateCharacterInput {
  name: string;
  description?: string;
  class?: string;
  role: CharacterRole;
  stats?: CharacterStats;
}

/**
 * Repository for party CRUD operations
 */
export class PartyRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create a new party for a game
   */
  create(gameId: string, name?: string): Party {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO parties (id, game_id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, gameId, name || null, now, now);

    return {
      id,
      gameId,
      members: [],
    };
  }

  /**
   * Find all parties for a game
   */
  findByGameId(gameId: string): Party[] {
    const rows = this.db.prepare(`
      SELECT id, game_id FROM parties WHERE game_id = ?
    `).all(gameId) as PartyRow[];

    return rows.map(row => ({
      id: row.id,
      gameId: row.game_id,
      members: this.getCharactersByPartyId(row.id),
    }));
  }

  /**
   * Find all characters for a game (convenience method)
   * Returns all characters across all parties in the game
   * @deprecated Use findByGameId and access party.members instead
   */
  findByGame(gameId: string): Character[] {
    const parties = this.findByGameId(gameId);
    return parties.flatMap(party => party.members);
  }

  /**
   * Get a party with all its members
   */
  getWithMembers(partyId: string): Party | null {
    const row = this.db.prepare(`
      SELECT id, game_id FROM parties WHERE id = ?
    `).get(partyId) as PartyRow | undefined;

    if (!row) return null;

    return {
      id: row.id,
      gameId: row.game_id,
      members: this.getCharactersByPartyId(row.id),
    };
  }

  /**
   * Update a party
   */
  update(party: { id: string; name?: string }): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (party.name !== undefined) {
      fields.push('name = ?');
      values.push(party.name);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(party.id);

    this.db.prepare(`
      UPDATE parties SET ${fields.join(', ')} WHERE id = ?
    `).run(...values);
  }

  /**
   * Delete a party and all its characters
   */
  delete(id: string): void {
    const deleteParty = this.db.transaction(() => {
      this.db.prepare('DELETE FROM characters WHERE party_id = ?').run(id);
      this.db.prepare('DELETE FROM parties WHERE id = ?').run(id);
    });
    deleteParty();
  }

  /**
   * Add a character to a party
   */
  addCharacter(partyId: string, input: CreateCharacterInput): Character {
    const id = randomUUID();
    const now = new Date().toISOString();
    const stats = input.stats || { health: 100, maxHealth: 100 };

    this.db.prepare(`
      INSERT INTO characters (id, party_id, name, description, class, role, stats, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      partyId,
      input.name,
      input.description || null,
      input.class || null,
      input.role,
      JSON.stringify(stats),
      now,
      now
    );

    return {
      id,
      name: input.name,
      description: input.description || '',
      class: input.class || '',
      stats,
    };
  }

  /**
   * Update a character
   */
  updateCharacter(character: Partial<Character> & { id: string }): void {
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

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(character.id);

    this.db.prepare(`
      UPDATE characters SET ${fields.join(', ')} WHERE id = ?
    `).run(...values);
  }

  /**
   * Remove a character from a party
   */
  removeCharacter(characterId: string): void {
    this.db.prepare('DELETE FROM characters WHERE id = ?').run(characterId);
  }

  /**
   * Get characters for a party
   */
  private getCharactersByPartyId(partyId: string): Character[] {
    const rows = this.db.prepare(`
      SELECT id, name, description, class, stats FROM characters WHERE party_id = ?
    `).all(partyId) as CharacterRow[];

    return rows.map(row => this.rowToCharacter(row));
  }

  private rowToCharacter(row: CharacterRow): Character {
    let stats: CharacterStats = { health: 100, maxHealth: 100 };
    if (row.stats) {
      try {
        stats = JSON.parse(row.stats);
      } catch {
        // Use default stats if parsing fails
      }
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      class: row.class || '',
      stats,
    };
  }
}

interface PartyRow {
  id: string;
  game_id: string;
}

interface CharacterRow {
  id: string;
  name: string;
  description: string | null;
  class: string | null;
  stats: string | null;
}
