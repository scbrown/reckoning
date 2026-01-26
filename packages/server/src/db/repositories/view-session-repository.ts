import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

/**
 * View types for multi-view system
 */
export type ViewType = 'party' | 'dm' | 'player';

/**
 * View session record
 */
export interface ViewSession {
  id: string;
  gameId: string;
  viewType: ViewType;
  characterId: string | null;
  tokenHash: string;
  displayName: string | null;
  lastActive: string;
  createdAt: string;
}

/**
 * Input for creating a view session
 */
export interface CreateViewSessionInput {
  gameId: string;
  viewType: ViewType;
  characterId?: string;
  tokenHash: string;
  displayName?: string;
}

/**
 * Join code record
 */
export interface JoinCode {
  id: string;
  code: string;
  gameId: string;
  viewType: 'party' | 'player';
  characterId: string | null;
  expiresAt: string;
  maxUses: number;
  currentUses: number;
  createdAt: string;
}

/**
 * Input for creating a join code
 */
export interface CreateJoinCodeInput {
  gameId: string;
  viewType: 'party' | 'player';
  characterId?: string;
  expiresAt: string;
  maxUses?: number;
}

/**
 * Database row types
 */
interface ViewSessionRow {
  id: string;
  game_id: string;
  view_type: string;
  character_id: string | null;
  token_hash: string;
  display_name: string | null;
  last_active: string;
  created_at: string;
}

interface JoinCodeRow {
  id: string;
  code: string;
  game_id: string;
  view_type: string;
  character_id: string | null;
  expires_at: string;
  max_uses: number;
  current_uses: number;
  created_at: string;
}

/**
 * Repository for view session and join code operations
 */
export class ViewSessionRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // =========================================================================
  // View Sessions
  // =========================================================================

  /**
   * Create a new view session
   */
  createSession(input: CreateViewSessionInput): ViewSession {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
      INSERT INTO view_sessions (id, game_id, view_type, character_id, token_hash, display_name, last_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        input.gameId,
        input.viewType,
        input.characterId || null,
        input.tokenHash,
        input.displayName || null,
        now,
        now
      );

    return {
      id,
      gameId: input.gameId,
      viewType: input.viewType,
      characterId: input.characterId || null,
      tokenHash: input.tokenHash,
      displayName: input.displayName || null,
      lastActive: now,
      createdAt: now,
    };
  }

  /**
   * Find a view session by ID
   */
  findSessionById(id: string): ViewSession | null {
    const row = this.db
      .prepare(
        `
      SELECT id, game_id, view_type, character_id, token_hash, display_name, last_active, created_at
      FROM view_sessions WHERE id = ?
    `
      )
      .get(id) as ViewSessionRow | undefined;

    if (!row) return null;
    return this.rowToSession(row);
  }

  /**
   * Find a view session by token hash
   */
  findSessionByToken(tokenHash: string): ViewSession | null {
    const row = this.db
      .prepare(
        `
      SELECT id, game_id, view_type, character_id, token_hash, display_name, last_active, created_at
      FROM view_sessions WHERE token_hash = ?
    `
      )
      .get(tokenHash) as ViewSessionRow | undefined;

    if (!row) return null;
    return this.rowToSession(row);
  }

  /**
   * Find all sessions for a game
   */
  findSessionsByGame(gameId: string): ViewSession[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, game_id, view_type, character_id, token_hash, display_name, last_active, created_at
      FROM view_sessions WHERE game_id = ?
      ORDER BY last_active DESC
    `
      )
      .all(gameId) as ViewSessionRow[];

    return rows.map((row) => this.rowToSession(row));
  }

  /**
   * Find sessions by game and view type
   */
  findSessionsByGameAndType(gameId: string, viewType: ViewType): ViewSession[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, game_id, view_type, character_id, token_hash, display_name, last_active, created_at
      FROM view_sessions WHERE game_id = ? AND view_type = ?
      ORDER BY last_active DESC
    `
      )
      .all(gameId, viewType) as ViewSessionRow[];

    return rows.map((row) => this.rowToSession(row));
  }

  /**
   * Update last active timestamp for a session
   */
  touchSession(id: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE view_sessions SET last_active = ? WHERE id = ?')
      .run(now, id);
  }

  /**
   * Update display name for a session
   */
  updateSessionDisplayName(id: string, displayName: string): void {
    this.db
      .prepare('UPDATE view_sessions SET display_name = ? WHERE id = ?')
      .run(displayName, id);
  }

  /**
   * Delete a view session
   */
  deleteSession(id: string): void {
    this.db.prepare('DELETE FROM view_sessions WHERE id = ?').run(id);
  }

  /**
   * Delete all sessions for a game
   */
  deleteSessionsByGame(gameId: string): void {
    this.db.prepare('DELETE FROM view_sessions WHERE game_id = ?').run(gameId);
  }

  /**
   * Delete stale sessions (not active within threshold)
   */
  deleteStaleSessionsOlderThan(thresholdIso: string): number {
    const result = this.db
      .prepare('DELETE FROM view_sessions WHERE last_active < ?')
      .run(thresholdIso);
    return result.changes;
  }

  /**
   * Count active sessions for a game
   */
  countSessionsByGame(gameId: string): number {
    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM view_sessions WHERE game_id = ?')
      .get(gameId) as { count: number };
    return result.count;
  }

  // =========================================================================
  // Join Codes
  // =========================================================================

  /**
   * Generate a short alphanumeric code
   */
  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars: I, O, 0, 1
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Create a new join code
   */
  createJoinCode(input: CreateJoinCodeInput): JoinCode {
    const id = randomUUID();
    const code = this.generateCode();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
      INSERT INTO join_codes (id, code, game_id, view_type, character_id, expires_at, max_uses, current_uses, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `
      )
      .run(
        id,
        code,
        input.gameId,
        input.viewType,
        input.characterId || null,
        input.expiresAt,
        input.maxUses ?? 1,
        now
      );

    return {
      id,
      code,
      gameId: input.gameId,
      viewType: input.viewType,
      characterId: input.characterId || null,
      expiresAt: input.expiresAt,
      maxUses: input.maxUses ?? 1,
      currentUses: 0,
      createdAt: now,
    };
  }

  /**
   * Find a join code by ID
   */
  findJoinCodeById(id: string): JoinCode | null {
    const row = this.db
      .prepare(
        `
      SELECT id, code, game_id, view_type, character_id, expires_at, max_uses, current_uses, created_at
      FROM join_codes WHERE id = ?
    `
      )
      .get(id) as JoinCodeRow | undefined;

    if (!row) return null;
    return this.rowToJoinCode(row);
  }

  /**
   * Find a join code by code string
   */
  findJoinCodeByCode(code: string): JoinCode | null {
    const row = this.db
      .prepare(
        `
      SELECT id, code, game_id, view_type, character_id, expires_at, max_uses, current_uses, created_at
      FROM join_codes WHERE code = ?
    `
      )
      .get(code.toUpperCase()) as JoinCodeRow | undefined;

    if (!row) return null;
    return this.rowToJoinCode(row);
  }

  /**
   * Find all join codes for a game
   */
  findJoinCodesByGame(gameId: string): JoinCode[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, code, game_id, view_type, character_id, expires_at, max_uses, current_uses, created_at
      FROM join_codes WHERE game_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(gameId) as JoinCodeRow[];

    return rows.map((row) => this.rowToJoinCode(row));
  }

  /**
   * Check if a join code is valid (not expired, not exhausted)
   */
  isJoinCodeValid(code: string): boolean {
    const joinCode = this.findJoinCodeByCode(code);
    if (!joinCode) return false;

    const now = new Date().toISOString();
    if (joinCode.expiresAt < now) return false;
    if (joinCode.currentUses >= joinCode.maxUses) return false;

    return true;
  }

  /**
   * Consume a join code (increment usage)
   * Returns the join code if successful, null if invalid
   */
  consumeJoinCode(code: string): JoinCode | null {
    const joinCode = this.findJoinCodeByCode(code);
    if (!joinCode) return null;

    const now = new Date().toISOString();
    if (joinCode.expiresAt < now) return null;
    if (joinCode.currentUses >= joinCode.maxUses) return null;

    this.db
      .prepare('UPDATE join_codes SET current_uses = current_uses + 1 WHERE id = ?')
      .run(joinCode.id);

    return {
      ...joinCode,
      currentUses: joinCode.currentUses + 1,
    };
  }

  /**
   * Delete a join code
   */
  deleteJoinCode(id: string): void {
    this.db.prepare('DELETE FROM join_codes WHERE id = ?').run(id);
  }

  /**
   * Delete all join codes for a game
   */
  deleteJoinCodesByGame(gameId: string): void {
    this.db.prepare('DELETE FROM join_codes WHERE game_id = ?').run(gameId);
  }

  /**
   * Delete expired join codes
   */
  deleteExpiredJoinCodes(): number {
    const now = new Date().toISOString();
    const result = this.db
      .prepare('DELETE FROM join_codes WHERE expires_at < ?')
      .run(now);
    return result.changes;
  }

  // =========================================================================
  // Row converters
  // =========================================================================

  private rowToSession(row: ViewSessionRow): ViewSession {
    return {
      id: row.id,
      gameId: row.game_id,
      viewType: row.view_type as ViewType,
      characterId: row.character_id,
      tokenHash: row.token_hash,
      displayName: row.display_name,
      lastActive: row.last_active,
      createdAt: row.created_at,
    };
  }

  private rowToJoinCode(row: JoinCodeRow): JoinCode {
    return {
      id: row.id,
      code: row.code,
      gameId: row.game_id,
      viewType: row.view_type as 'party' | 'player',
      characterId: row.character_id,
      expiresAt: row.expires_at,
      maxUses: row.max_uses,
      currentUses: row.current_uses,
      createdAt: row.created_at,
    };
  }
}
