import type Database from 'better-sqlite3';
import type { DMEditorState, EditorStatus } from '@reckoning/shared/game';

/**
 * Repository for DM editor state operations
 */
export class EditorStateRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Get editor state for a game
   */
  get(gameId: string): DMEditorState | null {
    const row = this.db.prepare(`
      SELECT pending_content, edited_content, status
      FROM editor_state WHERE game_id = ?
    `).get(gameId) as EditorStateRow | undefined;

    if (!row) return null;

    return {
      pending: row.pending_content || null,
      editedContent: row.edited_content || null,
      status: (row.status as EditorStatus) || 'idle',
    };
  }

  /**
   * Set editor state for a game (upsert)
   */
  set(gameId: string, state: DMEditorState): void {
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO editor_state (game_id, pending_content, edited_content, status, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(game_id) DO UPDATE SET
        pending_content = excluded.pending_content,
        edited_content = excluded.edited_content,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run(
      gameId,
      state.pending || null,
      state.editedContent || null,
      state.status,
      now
    );
  }

  /**
   * Clear editor state for a game
   */
  clear(gameId: string): void {
    this.db.prepare('DELETE FROM editor_state WHERE game_id = ?').run(gameId);
  }

  /**
   * Update only the status field
   */
  setStatus(gameId: string, status: EditorStatus): void {
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE editor_state SET status = ?, updated_at = ? WHERE game_id = ?
    `).run(status, now, gameId);
  }

  /**
   * Set pending content
   */
  setPending(gameId: string, content: string): void {
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO editor_state (game_id, pending_content, status, updated_at)
      VALUES (?, ?, 'editing', ?)
      ON CONFLICT(game_id) DO UPDATE SET
        pending_content = excluded.pending_content,
        status = 'editing',
        updated_at = excluded.updated_at
    `).run(gameId, content, now);
  }
}

interface EditorStateRow {
  pending_content: string | null;
  edited_content: string | null;
  status: string;
}
