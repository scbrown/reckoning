import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ViewSessionRepository } from '../view-session-repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('ViewSessionRepository', () => {
  let db: Database.Database;
  let repo: ViewSessionRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a test game
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'default-area', 10)
    `);

    // Create a test party and character for player view tests
    db.exec(`
      INSERT INTO parties (id, game_id, name)
      VALUES ('party-1', 'game-1', 'Test Party')
    `);
    db.exec(`
      INSERT INTO characters (id, party_id, name, description, role)
      VALUES ('char-1', 'party-1', 'Test Character', 'A test character', 'player')
    `);

    repo = new ViewSessionRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  // =========================================================================
  // View Sessions
  // =========================================================================

  describe('createSession', () => {
    it('should create a party view session', () => {
      const session = repo.createSession({
        gameId: 'game-1',
        viewType: 'party',
        tokenHash: 'abc123hash',
        displayName: 'Party Viewer',
      });

      expect(session.id).toBeDefined();
      expect(session.gameId).toBe('game-1');
      expect(session.viewType).toBe('party');
      expect(session.tokenHash).toBe('abc123hash');
      expect(session.displayName).toBe('Party Viewer');
      expect(session.characterId).toBeNull();
      expect(session.lastActive).toBeDefined();
      expect(session.createdAt).toBeDefined();
    });

    it('should create a DM view session', () => {
      const session = repo.createSession({
        gameId: 'game-1',
        viewType: 'dm',
        tokenHash: 'dmhash456',
      });

      expect(session.viewType).toBe('dm');
      expect(session.displayName).toBeNull();
    });

    it('should create a player view session with character', () => {
      const session = repo.createSession({
        gameId: 'game-1',
        viewType: 'player',
        characterId: 'char-1',
        tokenHash: 'playerhash789',
        displayName: 'Alice',
      });

      expect(session.viewType).toBe('player');
      expect(session.characterId).toBe('char-1');
      expect(session.displayName).toBe('Alice');
    });
  });

  describe('findSessionById', () => {
    it('should find a session by ID', () => {
      const created = repo.createSession({
        gameId: 'game-1',
        viewType: 'party',
        tokenHash: 'hash1',
      });

      const found = repo.findSessionById(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.viewType).toBe('party');
    });

    it('should return null for non-existent ID', () => {
      const found = repo.findSessionById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findSessionByToken', () => {
    it('should find a session by token hash', () => {
      repo.createSession({
        gameId: 'game-1',
        viewType: 'party',
        tokenHash: 'unique-token-hash',
        displayName: 'Test User',
      });

      const found = repo.findSessionByToken('unique-token-hash');
      expect(found).not.toBeNull();
      expect(found!.tokenHash).toBe('unique-token-hash');
      expect(found!.displayName).toBe('Test User');
    });

    it('should return null for non-existent token', () => {
      const found = repo.findSessionByToken('no-such-token');
      expect(found).toBeNull();
    });
  });

  describe('findSessionsByGame', () => {
    beforeEach(() => {
      repo.createSession({ gameId: 'game-1', viewType: 'dm', tokenHash: 'dm-token' });
      repo.createSession({ gameId: 'game-1', viewType: 'party', tokenHash: 'party-token-1' });
      repo.createSession({ gameId: 'game-1', viewType: 'party', tokenHash: 'party-token-2' });
    });

    it('should find all sessions for a game', () => {
      const sessions = repo.findSessionsByGame('game-1');
      expect(sessions).toHaveLength(3);
    });

    it('should return empty array for game with no sessions', () => {
      db.exec(`
        INSERT INTO games (id, player_id, current_area_id, turn)
        VALUES ('game-2', 'player-2', 'default-area', 1)
      `);

      const sessions = repo.findSessionsByGame('game-2');
      expect(sessions).toHaveLength(0);
    });
  });

  describe('findSessionsByGameAndType', () => {
    beforeEach(() => {
      repo.createSession({ gameId: 'game-1', viewType: 'dm', tokenHash: 'dm-token' });
      repo.createSession({ gameId: 'game-1', viewType: 'party', tokenHash: 'party-token-1' });
      repo.createSession({ gameId: 'game-1', viewType: 'party', tokenHash: 'party-token-2' });
    });

    it('should find sessions by game and type', () => {
      const partySessions = repo.findSessionsByGameAndType('game-1', 'party');
      expect(partySessions).toHaveLength(2);

      const dmSessions = repo.findSessionsByGameAndType('game-1', 'dm');
      expect(dmSessions).toHaveLength(1);
    });
  });

  describe('touchSession', () => {
    it('should update last_active timestamp', () => {
      const session = repo.createSession({
        gameId: 'game-1',
        viewType: 'party',
        tokenHash: 'touch-test',
      });

      // Set last_active to old date
      db.prepare('UPDATE view_sessions SET last_active = ? WHERE id = ?')
        .run('2020-01-01T00:00:00.000Z', session.id);

      repo.touchSession(session.id);

      const updated = repo.findSessionById(session.id);
      expect(updated!.lastActive).not.toBe('2020-01-01T00:00:00.000Z');
    });
  });

  describe('updateSessionDisplayName', () => {
    it('should update display name', () => {
      const session = repo.createSession({
        gameId: 'game-1',
        viewType: 'party',
        tokenHash: 'name-test',
        displayName: 'Original Name',
      });

      repo.updateSessionDisplayName(session.id, 'New Name');

      const updated = repo.findSessionById(session.id);
      expect(updated!.displayName).toBe('New Name');
    });
  });

  describe('deleteSession', () => {
    it('should delete a session', () => {
      const session = repo.createSession({
        gameId: 'game-1',
        viewType: 'party',
        tokenHash: 'delete-me',
      });

      repo.deleteSession(session.id);

      const found = repo.findSessionById(session.id);
      expect(found).toBeNull();
    });
  });

  describe('deleteSessionsByGame', () => {
    it('should delete all sessions for a game', () => {
      repo.createSession({ gameId: 'game-1', viewType: 'dm', tokenHash: 'dm-token' });
      repo.createSession({ gameId: 'game-1', viewType: 'party', tokenHash: 'party-token' });

      repo.deleteSessionsByGame('game-1');

      const sessions = repo.findSessionsByGame('game-1');
      expect(sessions).toHaveLength(0);
    });
  });

  describe('deleteStaleSessionsOlderThan', () => {
    it('should delete sessions older than threshold', () => {
      const session = repo.createSession({
        gameId: 'game-1',
        viewType: 'party',
        tokenHash: 'stale-session',
      });

      // Set last_active to old date
      db.prepare('UPDATE view_sessions SET last_active = ? WHERE id = ?')
        .run('2020-01-01T00:00:00.000Z', session.id);

      const deleted = repo.deleteStaleSessionsOlderThan('2021-01-01T00:00:00.000Z');
      expect(deleted).toBe(1);

      const found = repo.findSessionById(session.id);
      expect(found).toBeNull();
    });

    it('should not delete sessions newer than threshold', () => {
      const session = repo.createSession({
        gameId: 'game-1',
        viewType: 'party',
        tokenHash: 'fresh-session',
      });

      const deleted = repo.deleteStaleSessionsOlderThan('2020-01-01T00:00:00.000Z');
      expect(deleted).toBe(0);

      const found = repo.findSessionById(session.id);
      expect(found).not.toBeNull();
    });
  });

  describe('countSessionsByGame', () => {
    it('should count sessions for a game', () => {
      repo.createSession({ gameId: 'game-1', viewType: 'dm', tokenHash: 'dm-token' });
      repo.createSession({ gameId: 'game-1', viewType: 'party', tokenHash: 'party-token' });

      const count = repo.countSessionsByGame('game-1');
      expect(count).toBe(2);
    });

    it('should return 0 for game with no sessions', () => {
      const count = repo.countSessionsByGame('no-such-game');
      expect(count).toBe(0);
    });
  });

  // =========================================================================
  // Join Codes
  // =========================================================================

  describe('createJoinCode', () => {
    it('should create a join code for party view', () => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
      const joinCode = repo.createJoinCode({
        gameId: 'game-1',
        viewType: 'party',
        expiresAt,
        maxUses: 5,
      });

      expect(joinCode.id).toBeDefined();
      expect(joinCode.code).toMatch(/^[A-Z0-9]{6}$/);
      expect(joinCode.gameId).toBe('game-1');
      expect(joinCode.viewType).toBe('party');
      expect(joinCode.characterId).toBeNull();
      expect(joinCode.expiresAt).toBe(expiresAt);
      expect(joinCode.maxUses).toBe(5);
      expect(joinCode.currentUses).toBe(0);
    });

    it('should create a join code for player view with character', () => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      const joinCode = repo.createJoinCode({
        gameId: 'game-1',
        viewType: 'player',
        characterId: 'char-1',
        expiresAt,
      });

      expect(joinCode.viewType).toBe('player');
      expect(joinCode.characterId).toBe('char-1');
      expect(joinCode.maxUses).toBe(1); // Default
    });
  });

  describe('findJoinCodeById', () => {
    it('should find a join code by ID', () => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      const created = repo.createJoinCode({
        gameId: 'game-1',
        viewType: 'party',
        expiresAt,
      });

      const found = repo.findJoinCodeById(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('should return null for non-existent ID', () => {
      const found = repo.findJoinCodeById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findJoinCodeByCode', () => {
    it('should find a join code by code string', () => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      const created = repo.createJoinCode({
        gameId: 'game-1',
        viewType: 'party',
        expiresAt,
      });

      const found = repo.findJoinCodeByCode(created.code);
      expect(found).not.toBeNull();
      expect(found!.code).toBe(created.code);
    });

    it('should find code case-insensitively', () => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      const created = repo.createJoinCode({
        gameId: 'game-1',
        viewType: 'party',
        expiresAt,
      });

      const found = repo.findJoinCodeByCode(created.code.toLowerCase());
      expect(found).not.toBeNull();
    });

    it('should return null for non-existent code', () => {
      const found = repo.findJoinCodeByCode('XXXXXX');
      expect(found).toBeNull();
    });
  });

  describe('findJoinCodesByGame', () => {
    it('should find all join codes for a game', () => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      repo.createJoinCode({ gameId: 'game-1', viewType: 'party', expiresAt });
      repo.createJoinCode({ gameId: 'game-1', viewType: 'party', expiresAt });

      const codes = repo.findJoinCodesByGame('game-1');
      expect(codes).toHaveLength(2);
    });
  });

  describe('isJoinCodeValid', () => {
    it('should return true for valid code', () => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      const joinCode = repo.createJoinCode({
        gameId: 'game-1',
        viewType: 'party',
        expiresAt,
        maxUses: 5,
      });

      expect(repo.isJoinCodeValid(joinCode.code)).toBe(true);
    });

    it('should return false for expired code', () => {
      const expiresAt = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      const joinCode = repo.createJoinCode({
        gameId: 'game-1',
        viewType: 'party',
        expiresAt,
      });

      expect(repo.isJoinCodeValid(joinCode.code)).toBe(false);
    });

    it('should return false for exhausted code', () => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      const joinCode = repo.createJoinCode({
        gameId: 'game-1',
        viewType: 'party',
        expiresAt,
        maxUses: 1,
      });

      // Exhaust the code
      db.prepare('UPDATE join_codes SET current_uses = max_uses WHERE id = ?')
        .run(joinCode.id);

      expect(repo.isJoinCodeValid(joinCode.code)).toBe(false);
    });

    it('should return false for non-existent code', () => {
      expect(repo.isJoinCodeValid('XXXXXX')).toBe(false);
    });
  });

  describe('consumeJoinCode', () => {
    it('should increment usage and return code', () => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      const joinCode = repo.createJoinCode({
        gameId: 'game-1',
        viewType: 'party',
        expiresAt,
        maxUses: 3,
      });

      const consumed = repo.consumeJoinCode(joinCode.code);
      expect(consumed).not.toBeNull();
      expect(consumed!.currentUses).toBe(1);

      // Verify in database
      const found = repo.findJoinCodeById(joinCode.id);
      expect(found!.currentUses).toBe(1);
    });

    it('should return null for expired code', () => {
      const expiresAt = new Date(Date.now() - 3600000).toISOString();
      const joinCode = repo.createJoinCode({
        gameId: 'game-1',
        viewType: 'party',
        expiresAt,
      });

      const consumed = repo.consumeJoinCode(joinCode.code);
      expect(consumed).toBeNull();
    });

    it('should return null for exhausted code', () => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      const joinCode = repo.createJoinCode({
        gameId: 'game-1',
        viewType: 'party',
        expiresAt,
        maxUses: 1,
      });

      // Use once (should work)
      const first = repo.consumeJoinCode(joinCode.code);
      expect(first).not.toBeNull();

      // Use again (should fail)
      const second = repo.consumeJoinCode(joinCode.code);
      expect(second).toBeNull();
    });
  });

  describe('deleteJoinCode', () => {
    it('should delete a join code', () => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      const joinCode = repo.createJoinCode({
        gameId: 'game-1',
        viewType: 'party',
        expiresAt,
      });

      repo.deleteJoinCode(joinCode.id);

      const found = repo.findJoinCodeById(joinCode.id);
      expect(found).toBeNull();
    });
  });

  describe('deleteJoinCodesByGame', () => {
    it('should delete all join codes for a game', () => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      repo.createJoinCode({ gameId: 'game-1', viewType: 'party', expiresAt });
      repo.createJoinCode({ gameId: 'game-1', viewType: 'party', expiresAt });

      repo.deleteJoinCodesByGame('game-1');

      const codes = repo.findJoinCodesByGame('game-1');
      expect(codes).toHaveLength(0);
    });
  });

  describe('deleteExpiredJoinCodes', () => {
    it('should delete expired join codes', () => {
      const pastExpiry = new Date(Date.now() - 3600000).toISOString();
      const futureExpiry = new Date(Date.now() + 3600000).toISOString();

      repo.createJoinCode({ gameId: 'game-1', viewType: 'party', expiresAt: pastExpiry });
      const validCode = repo.createJoinCode({ gameId: 'game-1', viewType: 'party', expiresAt: futureExpiry });

      const deleted = repo.deleteExpiredJoinCodes();
      expect(deleted).toBe(1);

      const codes = repo.findJoinCodesByGame('game-1');
      expect(codes).toHaveLength(1);
      expect(codes[0].id).toBe(validCode.id);
    });
  });
});
