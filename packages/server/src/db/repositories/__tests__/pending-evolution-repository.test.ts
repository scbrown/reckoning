import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PendingEvolutionRepository } from '../pending-evolution-repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PendingEvolutionRepository', () => {
  let db: Database.Database;
  let repo: PendingEvolutionRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a test game
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'area-1', 5)
    `);

    repo = new PendingEvolutionRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('create', () => {
    it('should create a trait_add evolution', () => {
      const evolution = repo.create({
        gameId: 'game-1',
        turn: 5,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Spared the defeated enemy',
      });

      expect(evolution.id).toBeDefined();
      expect(evolution.gameId).toBe('game-1');
      expect(evolution.turn).toBe(5);
      expect(evolution.evolutionType).toBe('trait_add');
      expect(evolution.entityType).toBe('player');
      expect(evolution.entityId).toBe('player-1');
      expect(evolution.trait).toBe('merciful');
      expect(evolution.reason).toBe('Spared the defeated enemy');
      expect(evolution.status).toBe('pending');
      expect(evolution.createdAt).toBeDefined();
    });

    it('should create a trait_remove evolution', () => {
      const evolution = repo.create({
        gameId: 'game-1',
        turn: 10,
        evolutionType: 'trait_remove',
        entityType: 'npc',
        entityId: 'npc-1',
        trait: 'trusting',
        reason: 'Betrayed multiple times',
      });

      expect(evolution.evolutionType).toBe('trait_remove');
      expect(evolution.trait).toBe('trusting');
    });

    it('should create a relationship_change evolution', () => {
      const evolution = repo.create({
        gameId: 'game-1',
        turn: 3,
        evolutionType: 'relationship_change',
        entityType: 'npc',
        entityId: 'npc-1',
        targetType: 'player',
        targetId: 'player-1',
        dimension: 'trust',
        oldValue: 0.5,
        newValue: 0.3,
        reason: 'Player lied about intentions',
      });

      expect(evolution.evolutionType).toBe('relationship_change');
      expect(evolution.targetType).toBe('player');
      expect(evolution.targetId).toBe('player-1');
      expect(evolution.dimension).toBe('trust');
      expect(evolution.oldValue).toBe(0.5);
      expect(evolution.newValue).toBe(0.3);
    });

    it('should include source event ID when provided', () => {
      // Create a test event first to satisfy foreign key constraint
      db.exec(`
        INSERT INTO events (id, game_id, turn, event_type, content, location_id)
        VALUES ('event-123', 'game-1', 5, 'action', 'Player charged into battle', 'area-1')
      `);

      const evolution = repo.create({
        gameId: 'game-1',
        turn: 5,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'brave',
        reason: 'Charged into battle alone',
        sourceEventId: 'event-123',
      });

      expect(evolution.sourceEventId).toBe('event-123');
    });
  });

  describe('findById', () => {
    it('should find evolution by ID', () => {
      const created = repo.create({
        gameId: 'game-1',
        turn: 5,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Test reason',
      });

      const found = repo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.trait).toBe('merciful');
    });

    it('should return null for non-existent ID', () => {
      const found = repo.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('findPending', () => {
    it('should find all pending evolutions for a game', () => {
      repo.create({
        gameId: 'game-1',
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Reason 1',
      });

      repo.create({
        gameId: 'game-1',
        turn: 2,
        evolutionType: 'trait_add',
        entityType: 'npc',
        entityId: 'npc-1',
        trait: 'bitter',
        reason: 'Reason 2',
      });

      const pending = repo.findPending('game-1');
      expect(pending).toHaveLength(2);
      expect(pending[0].turn).toBe(1);
      expect(pending[1].turn).toBe(2);
    });

    it('should filter by status', () => {
      const evo1 = repo.create({
        gameId: 'game-1',
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Reason 1',
      });

      repo.create({
        gameId: 'game-1',
        turn: 2,
        evolutionType: 'trait_add',
        entityType: 'npc',
        entityId: 'npc-1',
        trait: 'bitter',
        reason: 'Reason 2',
      });

      // Resolve first evolution
      repo.resolve(evo1.id, { status: 'approved' });

      const pending = repo.findPending('game-1', 'pending');
      expect(pending).toHaveLength(1);
      expect(pending[0].trait).toBe('bitter');

      const approved = repo.findPending('game-1', 'approved');
      expect(approved).toHaveLength(1);
      expect(approved[0].trait).toBe('merciful');
    });

    it('should return empty array for game with no evolutions', () => {
      const pending = repo.findPending('game-1');
      expect(pending).toHaveLength(0);
    });
  });

  describe('findByGame', () => {
    it('should find all evolutions regardless of status', () => {
      const evo1 = repo.create({
        gameId: 'game-1',
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Reason 1',
      });

      repo.create({
        gameId: 'game-1',
        turn: 2,
        evolutionType: 'trait_add',
        entityType: 'npc',
        entityId: 'npc-1',
        trait: 'bitter',
        reason: 'Reason 2',
      });

      repo.resolve(evo1.id, { status: 'approved' });

      const all = repo.findByGame('game-1');
      expect(all).toHaveLength(2);
    });
  });

  describe('resolve', () => {
    it('should approve an evolution', () => {
      const created = repo.create({
        gameId: 'game-1',
        turn: 5,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Test reason',
      });

      const resolved = repo.resolve(created.id, { status: 'approved' });
      expect(resolved).not.toBeNull();
      expect(resolved!.status).toBe('approved');
      expect(resolved!.resolvedAt).toBeDefined();
    });

    it('should refuse an evolution with notes', () => {
      const created = repo.create({
        gameId: 'game-1',
        turn: 5,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Test reason',
      });

      const resolved = repo.resolve(created.id, {
        status: 'refused',
        dmNotes: 'Not enough evidence for this trait',
      });

      expect(resolved!.status).toBe('refused');
      expect(resolved!.dmNotes).toBe('Not enough evidence for this trait');
    });

    it('should return null for non-existent evolution', () => {
      const resolved = repo.resolve('non-existent', { status: 'approved' });
      expect(resolved).toBeNull();
    });
  });

  describe('update', () => {
    it('should update evolution details', () => {
      const created = repo.create({
        gameId: 'game-1',
        turn: 5,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Original reason',
      });

      const updated = repo.update(created.id, {
        reason: 'Updated reason',
        dmNotes: 'DM adjusted the reasoning',
      });

      expect(updated).not.toBeNull();
      expect(updated!.reason).toBe('Updated reason');
      expect(updated!.dmNotes).toBe('DM adjusted the reasoning');
      expect(updated!.trait).toBe('merciful'); // Unchanged
    });

    it('should update relationship evolution values', () => {
      const created = repo.create({
        gameId: 'game-1',
        turn: 3,
        evolutionType: 'relationship_change',
        entityType: 'npc',
        entityId: 'npc-1',
        targetType: 'player',
        targetId: 'player-1',
        dimension: 'trust',
        oldValue: 0.5,
        newValue: 0.3,
        reason: 'Player lied',
      });

      const updated = repo.update(created.id, {
        newValue: 0.2,
      });

      expect(updated!.newValue).toBe(0.2);
      expect(updated!.oldValue).toBe(0.5); // Unchanged
    });

    it('should return null for non-existent evolution', () => {
      const updated = repo.update('non-existent', { reason: 'New reason' });
      expect(updated).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete an evolution', () => {
      const created = repo.create({
        gameId: 'game-1',
        turn: 5,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Test reason',
      });

      repo.delete(created.id);
      const found = repo.findById(created.id);
      expect(found).toBeNull();
    });
  });

  describe('deleteByGame', () => {
    it('should delete all evolutions for a game', () => {
      repo.create({
        gameId: 'game-1',
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Reason 1',
      });

      repo.create({
        gameId: 'game-1',
        turn: 2,
        evolutionType: 'trait_add',
        entityType: 'npc',
        entityId: 'npc-1',
        trait: 'bitter',
        reason: 'Reason 2',
      });

      repo.deleteByGame('game-1');
      const remaining = repo.findByGame('game-1');
      expect(remaining).toHaveLength(0);
    });

    it('should not affect other games', () => {
      // Create second game
      db.exec(`
        INSERT INTO games (id, player_id, current_area_id, turn)
        VALUES ('game-2', 'player-2', 'area-1', 1)
      `);

      repo.create({
        gameId: 'game-1',
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Reason 1',
      });

      repo.create({
        gameId: 'game-2',
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-2',
        trait: 'brave',
        reason: 'Reason 2',
      });

      repo.deleteByGame('game-1');

      expect(repo.findByGame('game-1')).toHaveLength(0);
      expect(repo.findByGame('game-2')).toHaveLength(1);
    });
  });

  describe('findByEntity', () => {
    it('should find evolutions for a specific entity', () => {
      repo.create({
        gameId: 'game-1',
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Reason 1',
      });

      repo.create({
        gameId: 'game-1',
        turn: 2,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'brave',
        reason: 'Reason 2',
      });

      repo.create({
        gameId: 'game-1',
        turn: 3,
        evolutionType: 'trait_add',
        entityType: 'npc',
        entityId: 'npc-1',
        trait: 'bitter',
        reason: 'Reason 3',
      });

      const playerEvos = repo.findByEntity('game-1', 'player', 'player-1');
      expect(playerEvos).toHaveLength(2);

      const npcEvos = repo.findByEntity('game-1', 'npc', 'npc-1');
      expect(npcEvos).toHaveLength(1);
    });
  });
});
