import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  ChronicleEntry,
  CreateChronicleInput,
  NarratorBias,
} from '@reckoning/shared';

export class ChronicleRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(input: CreateChronicleInput): ChronicleEntry {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO chronicle_entries (
        id, game_id, turn_start, turn_end, content, bias,
        source_event_ids, reputation_impact, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.gameId,
      input.turnStart,
      input.turnEnd,
      input.content,
      input.bias,
      JSON.stringify(input.sourceEventIds),
      input.reputationImpact,
      now
    );

    return {
      id,
      gameId: input.gameId,
      turnStart: input.turnStart,
      turnEnd: input.turnEnd,
      content: input.content,
      bias: input.bias,
      sourceEventIds: input.sourceEventIds,
      reputationImpact: input.reputationImpact,
      createdAt: now,
    };
  }

  findById(id: string): ChronicleEntry | null {
    const row = this.db.prepare('SELECT * FROM chronicle_entries WHERE id = ?')
      .get(id) as ChronicleEntryRow | undefined;
    if (!row) return null;
    return this.rowToEntry(row);
  }

  findByGame(gameId: string, limit?: number): ChronicleEntry[] {
    let query = 'SELECT * FROM chronicle_entries WHERE game_id = ? ORDER BY turn_start ASC';
    if (limit) query += ` LIMIT ${limit}`;
    const rows = this.db.prepare(query).all(gameId) as ChronicleEntryRow[];
    return rows.map(r => this.rowToEntry(r));
  }

  findByTurnRange(gameId: string, turnStart: number, turnEnd: number): ChronicleEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM chronicle_entries
      WHERE game_id = ? AND turn_start >= ? AND turn_end <= ?
      ORDER BY turn_start ASC
    `).all(gameId, turnStart, turnEnd) as ChronicleEntryRow[];
    return rows.map(r => this.rowToEntry(r));
  }

  /** Get the cumulative reputation impact for a game */
  getReputationScore(gameId: string): number {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(reputation_impact), 0.0) as total
      FROM chronicle_entries WHERE game_id = ?
    `).get(gameId) as { total: number };
    return Math.max(-1, Math.min(1, row.total));
  }

  setDmOverride(id: string, overrideText: string): ChronicleEntry | null {
    this.db.prepare('UPDATE chronicle_entries SET dm_override = ? WHERE id = ?')
      .run(overrideText, id);
    return this.findById(id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM chronicle_entries WHERE id = ?').run(id);
  }

  private rowToEntry(row: ChronicleEntryRow): ChronicleEntry {
    const entry: ChronicleEntry = {
      id: row.id,
      gameId: row.game_id,
      turnStart: row.turn_start,
      turnEnd: row.turn_end,
      content: row.content,
      bias: row.bias as NarratorBias,
      sourceEventIds: JSON.parse(row.source_event_ids),
      reputationImpact: row.reputation_impact,
      createdAt: row.created_at,
    };
    if (row.dm_override !== null) {
      entry.dmOverride = row.dm_override;
    }
    return entry;
  }
}

interface ChronicleEntryRow {
  id: string;
  game_id: string;
  turn_start: number;
  turn_end: number;
  content: string;
  bias: string;
  source_event_ids: string;
  reputation_impact: number;
  dm_override: string | null;
  created_at: string;
}
