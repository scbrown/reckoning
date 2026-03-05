import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  MemoryEntry,
  CreateMemoryInput,
  DistortionType,
} from '@reckoning/shared';

export class MemoryJournalRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(input: CreateMemoryInput): MemoryEntry {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO memory_journal (
        id, game_id, character_id, source_event_id, turn,
        content, distortion_type, distortion_strength,
        influencing_traits, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.gameId,
      input.characterId,
      input.sourceEventId,
      input.turn,
      input.content,
      input.distortionType,
      input.distortionStrength,
      input.influencingTraits ? JSON.stringify(input.influencingTraits) : null,
      now
    );

    const entry: MemoryEntry = {
      id,
      gameId: input.gameId,
      characterId: input.characterId,
      sourceEventId: input.sourceEventId,
      turn: input.turn,
      content: input.content,
      distortionType: input.distortionType,
      distortionStrength: input.distortionStrength,
      dmApproved: false,
      createdAt: now,
    };

    if (input.influencingTraits && input.influencingTraits.length > 0) {
      entry.influencingTraits = input.influencingTraits;
    }

    return entry;
  }

  findById(id: string): MemoryEntry | null {
    const row = this.db.prepare(`
      SELECT * FROM memory_journal WHERE id = ?
    `).get(id) as MemoryJournalRow | undefined;

    if (!row) return null;
    return this.rowToEntry(row);
  }

  findByCharacter(gameId: string, characterId: string, limit?: number): MemoryEntry[] {
    let query = `
      SELECT * FROM memory_journal
      WHERE game_id = ? AND character_id = ?
      ORDER BY turn DESC
    `;
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const rows = this.db.prepare(query).all(gameId, characterId) as MemoryJournalRow[];
    return rows.map(row => this.rowToEntry(row));
  }

  findByEvent(sourceEventId: string): MemoryEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM memory_journal WHERE source_event_id = ?
    `).all(sourceEventId) as MemoryJournalRow[];

    return rows.map(row => this.rowToEntry(row));
  }

  findByGame(gameId: string, limit?: number): MemoryEntry[] {
    let query = `
      SELECT * FROM memory_journal
      WHERE game_id = ?
      ORDER BY turn DESC
    `;
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const rows = this.db.prepare(query).all(gameId) as MemoryJournalRow[];
    return rows.map(row => this.rowToEntry(row));
  }

  /** DM overrides the biased text with their own version */
  setDmOverride(id: string, overrideText: string): MemoryEntry | null {
    this.db.prepare(`
      UPDATE memory_journal SET dm_override = ?, dm_approved = 1
      WHERE id = ?
    `).run(overrideText, id);

    return this.findById(id);
  }

  /** DM approves the AI-generated biased entry */
  approve(id: string): MemoryEntry | null {
    this.db.prepare(`
      UPDATE memory_journal SET dm_approved = 1 WHERE id = ?
    `).run(id);

    return this.findById(id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM memory_journal WHERE id = ?').run(id);
  }

  deleteByGame(gameId: string): void {
    this.db.prepare('DELETE FROM memory_journal WHERE game_id = ?').run(gameId);
  }

  /** Check if a memory already exists for this event+character */
  existsForEvent(sourceEventId: string, characterId: string): boolean {
    const row = this.db.prepare(`
      SELECT 1 FROM memory_journal
      WHERE source_event_id = ? AND character_id = ?
      LIMIT 1
    `).get(sourceEventId, characterId);

    return row !== undefined;
  }

  private rowToEntry(row: MemoryJournalRow): MemoryEntry {
    const entry: MemoryEntry = {
      id: row.id,
      gameId: row.game_id,
      characterId: row.character_id,
      sourceEventId: row.source_event_id,
      turn: row.turn,
      content: row.content,
      distortionType: row.distortion_type as DistortionType,
      distortionStrength: row.distortion_strength,
      dmApproved: row.dm_approved === 1,
      createdAt: row.created_at,
    };

    if (row.influencing_traits !== null) {
      entry.influencingTraits = JSON.parse(row.influencing_traits);
    }
    if (row.dm_override !== null) {
      entry.dmOverride = row.dm_override;
    }

    return entry;
  }
}

interface MemoryJournalRow {
  id: string;
  game_id: string;
  character_id: string;
  source_event_id: string;
  turn: number;
  content: string;
  distortion_type: string;
  distortion_strength: number;
  influencing_traits: string | null;
  dm_override: string | null;
  dm_approved: number;
  created_at: string;
}
