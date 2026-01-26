import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PerceivedRelationshipRepository } from '../perceived-relationship-repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PerceivedRelationshipRepository', () => {
  let db: Database.Database;
  let repo: PerceivedRelationshipRepository;
  const gameId = 'test-game-1';
  const perceiverId = 'char-1';
  const targetId = 'npc-1';

  beforeEach(() => {
    db = new Database(':memory:');
    // Run schema
    const schemaPath = join(__dirname, '../../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Insert test game
    db.prepare('INSERT INTO games (id, player_id, current_area_id, turn) VALUES (?, ?, ?, ?)').run(
      gameId,
      'player-1',
      'area-1',
      10
    );

    repo = new PerceivedRelationshipRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('upsert', () => {
    it('should create a new perceived relationship', () => {
      const result = repo.upsert({
        gameId,
        perceiverId,
        targetId,
        lastUpdatedTurn: 5,
        perceivedTrust: 0.8,
        perceivedRespect: 0.6,
        perceivedAffection: 0.4,
      });

      expect(result.id).toBeDefined();
      expect(result.gameId).toBe(gameId);
      expect(result.perceiverId).toBe(perceiverId);
      expect(result.targetId).toBe(targetId);
      expect(result.perceivedTrust).toBe(0.8);
      expect(result.perceivedRespect).toBe(0.6);
      expect(result.perceivedAffection).toBe(0.4);
      expect(result.lastUpdatedTurn).toBe(5);
    });

    it('should update an existing perceived relationship', () => {
      // Create initial
      repo.upsert({
        gameId,
        perceiverId,
        targetId,
        lastUpdatedTurn: 5,
        perceivedTrust: 0.5,
      });

      // Update
      const result = repo.upsert({
        gameId,
        perceiverId,
        targetId,
        lastUpdatedTurn: 10,
        perceivedTrust: 0.8,
        perceivedRespect: 0.7,
      });

      expect(result.perceivedTrust).toBe(0.8);
      expect(result.perceivedRespect).toBe(0.7);
      expect(result.lastUpdatedTurn).toBe(10);
    });

    it('should allow null values for dimensions', () => {
      const result = repo.upsert({
        gameId,
        perceiverId,
        targetId,
        lastUpdatedTurn: 5,
        perceivedTrust: null,
        perceivedRespect: 0.6,
        perceivedAffection: null,
      });

      expect(result.perceivedTrust).toBeNull();
      expect(result.perceivedRespect).toBe(0.6);
      expect(result.perceivedAffection).toBeNull();
    });
  });

  describe('findByPerceiverAndTarget', () => {
    it('should find existing perceived relationship', () => {
      repo.upsert({
        gameId,
        perceiverId,
        targetId,
        lastUpdatedTurn: 5,
        perceivedTrust: 0.8,
      });

      const found = repo.findByPerceiverAndTarget(gameId, perceiverId, targetId);

      expect(found).not.toBeNull();
      expect(found!.perceivedTrust).toBe(0.8);
    });

    it('should return null for non-existent relationship', () => {
      const found = repo.findByPerceiverAndTarget(gameId, perceiverId, 'non-existent');

      expect(found).toBeNull();
    });
  });

  describe('findByPerceiver', () => {
    it('should find all relationships for a perceiver', () => {
      repo.upsert({
        gameId,
        perceiverId,
        targetId: 'target-1',
        lastUpdatedTurn: 5,
        perceivedTrust: 0.8,
      });

      repo.upsert({
        gameId,
        perceiverId,
        targetId: 'target-2',
        lastUpdatedTurn: 6,
        perceivedTrust: 0.3,
      });

      const results = repo.findByPerceiver(gameId, perceiverId);

      expect(results).toHaveLength(2);
    });
  });

  describe('findByGame', () => {
    it('should find all perceived relationships in a game', () => {
      repo.upsert({
        gameId,
        perceiverId: 'char-1',
        targetId: 'npc-1',
        lastUpdatedTurn: 5,
        perceivedTrust: 0.8,
      });

      repo.upsert({
        gameId,
        perceiverId: 'char-2',
        targetId: 'npc-2',
        lastUpdatedTurn: 6,
        perceivedTrust: 0.5,
      });

      const results = repo.findByGame(gameId);

      expect(results).toHaveLength(2);
    });
  });

  describe('delete', () => {
    it('should delete a perceived relationship by id', () => {
      const created = repo.upsert({
        gameId,
        perceiverId,
        targetId,
        lastUpdatedTurn: 5,
        perceivedTrust: 0.8,
      });

      repo.delete(created.id);

      const found = repo.findByPerceiverAndTarget(gameId, perceiverId, targetId);
      expect(found).toBeNull();
    });
  });

  describe('deleteByGame', () => {
    it('should delete all perceived relationships in a game', () => {
      repo.upsert({
        gameId,
        perceiverId: 'char-1',
        targetId: 'npc-1',
        lastUpdatedTurn: 5,
      });

      repo.upsert({
        gameId,
        perceiverId: 'char-2',
        targetId: 'npc-2',
        lastUpdatedTurn: 6,
      });

      repo.deleteByGame(gameId);

      const results = repo.findByGame(gameId);
      expect(results).toHaveLength(0);
    });
  });

  describe('deleteByPerceiver', () => {
    it('should delete all perceived relationships for a perceiver', () => {
      repo.upsert({
        gameId,
        perceiverId,
        targetId: 'target-1',
        lastUpdatedTurn: 5,
      });

      repo.upsert({
        gameId,
        perceiverId,
        targetId: 'target-2',
        lastUpdatedTurn: 6,
      });

      repo.upsert({
        gameId,
        perceiverId: 'other-char',
        targetId: 'target-1',
        lastUpdatedTurn: 7,
      });

      repo.deleteByPerceiver(gameId, perceiverId);

      const perceiverResults = repo.findByPerceiver(gameId, perceiverId);
      expect(perceiverResults).toHaveLength(0);

      // Other perceiver's relationships should remain
      const gameResults = repo.findByGame(gameId);
      expect(gameResults).toHaveLength(1);
    });
  });
});
